import type { Session } from "@shopify/shopify-api";
import { shopify } from "./shopify";
import { ensurePublicImageUrl } from "./shopify-staged-upload";
import { createDawnTheme, waitForThemeReady, themeEditorUrl } from "./shopify-theme-push";
import { createDawnWorkingCopy, injectStoreContent, cleanupWorkingCopy } from "./dawn-local";
import { pushThemeViaCli } from "./shopify-cli-push";
import type { SitePlan } from "./site-plan";

const PRODUCT_CREATE = `#graphql
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const PRODUCT_CREATE_MEDIA = `#graphql
  mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id }
      mediaUserErrors { field message }
    }
  }
`;

export type WizardPushResult = {
  product: { ok: boolean; productId?: string; error?: string };
  media: { attempted: number; uploaded: number; errors: string[] };
  theme: { ok: boolean; themeId?: string; previewUrl?: string; error?: string };
  // "auto": pushed via Shopify CLI (Theme Access token) — logo/hero copy is
  // already live in the theme. "manual": CLI push wasn't available/configured,
  // fell back to a blank Dawn copy via the Admin API — these carry the exact
  // copy for the merchant to paste into the Theme Editor themselves.
  themeContent:
    | { mode: "auto" }
    | { mode: "manual"; heading: string; subheading: string; hasLogo: boolean; reason: string };
};

export async function pushWizardToShopify(
  session: Session,
  wizard: {
    productName: string;
    brandName: string;
    brandColor: string;
    brandLogoDataUrl: string | null;
  },
  sitePlan: SitePlan,
  selectedImageUrls: string[],
): Promise<WizardPushResult> {
  const client = new shopify.clients.Graphql({ session });

  const result: WizardPushResult = {
    product: { ok: false },
    media: { attempted: selectedImageUrls.length, uploaded: 0, errors: [] },
    theme: { ok: false },
    themeContent: { mode: "manual", heading: "", subheading: "", hasLogo: false, reason: "not attempted" },
  };

  // 1. Create the draft product
  const descriptionHtml = [
    `<p>${sitePlan.productPage.headline}</p>`,
    "<ul>",
    ...sitePlan.productPage.bulletPoints.map((b) => `<li>${b}</li>`),
    "</ul>",
  ].join("");

  try {
    const response = await client.request(PRODUCT_CREATE, {
      variables: {
        product: {
          title: wizard.productName,
          descriptionHtml,
          tags: [wizard.brandName],
          status: "DRAFT",
        },
      },
    });
    const errors = response.data?.productCreate?.userErrors ?? [];
    const productId = response.data?.productCreate?.product?.id;
    if (errors.length > 0 || !productId) {
      result.product = { ok: false, error: errors.map((e: { message: string }) => e.message).join("; ") };
    } else {
      result.product = { ok: true, productId };
    }
  } catch (err) {
    result.product = { ok: false, error: String(err) };
  }

  // 2. Attach selected images as product media (best-effort per image)
  if (result.product.ok && result.product.productId) {
    const media: { originalSource: string; mediaContentType: "IMAGE" }[] = [];
    for (let i = 0; i < selectedImageUrls.length; i++) {
      try {
        const publicUrl = await ensurePublicImageUrl(session, selectedImageUrls[i], `${wizard.brandName}-${i}`);
        if (publicUrl) {
          media.push({ originalSource: publicUrl, mediaContentType: "IMAGE" });
        } else {
          result.media.errors.push(`Image ${i + 1}: could not resolve to a usable URL`);
        }
      } catch (err) {
        result.media.errors.push(`Image ${i + 1}: ${String(err)}`);
      }
    }

    if (media.length > 0) {
      try {
        const response = await client.request(PRODUCT_CREATE_MEDIA, {
          variables: { productId: result.product.productId, media },
        });
        const mediaErrors = response.data?.productCreateMedia?.mediaUserErrors ?? [];
        result.media.uploaded = (response.data?.productCreateMedia?.media ?? []).length;
        for (const e of mediaErrors as { message: string }[]) result.media.errors.push(e.message);
      } catch (err) {
        result.media.errors.push(String(err));
      }
    }
  }

  // 3. Build a customized Dawn theme locally (logo baked in, custom hero section,
  // homepage template) and push it to Shopify via the CLI — this bypasses the
  // Admin API's theme-file write restriction entirely, since the CLI acts as the
  // merchant's own theme-editing session rather than a third-party app.
  let workDir: string | undefined;
  try {
    workDir = await createDawnWorkingCopy();
    await injectStoreContent(workDir, {
      logoDataUrl: wizard.brandLogoDataUrl,
      hero: sitePlan.home,
      brandColor: wizard.brandColor,
    });
    const cliResult = await pushThemeViaCli({ shop: session.shop, path: workDir });
    result.theme = {
      ok: true,
      themeId: cliResult.themeId,
      previewUrl: cliResult.editorUrl ?? cliResult.previewUrl,
    };
    result.themeContent = { mode: "auto" };
  } catch (cliErr) {
    // Fall back: blank Dawn copy via the Admin API (always allowed) + manual
    // paste-in instructions for the content the CLI path would have applied.
    try {
      const themeId = await createDawnTheme(session, `${wizard.brandName} — AI Draft`);
      await waitForThemeReady(session, themeId);
      result.theme = { ok: true, themeId: String(themeId), previewUrl: themeEditorUrl(session.shop, themeId) };
    } catch (err) {
      result.theme = { ok: false, error: String(err) };
    }
    result.themeContent = {
      mode: "manual",
      heading: sitePlan.home.heroHeading,
      subheading: sitePlan.home.heroSubheading,
      hasLogo: Boolean(wizard.brandLogoDataUrl),
      reason: String(cliErr),
    };
  } finally {
    if (workDir) await cleanupWorkingCopy(workDir);
  }

  return result;
}
