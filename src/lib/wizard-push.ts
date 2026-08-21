import type { Session } from "@shopify/shopify-api";
import { shopify } from "./shopify";
import { ensurePublicImageUrl } from "./shopify-staged-upload";
import { createDawnTheme, waitForThemeReady, setThemeLogo, setHomepageHero, themeEditorUrl } from "./shopify-theme-push";
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
  theme: { ok: boolean; themeId?: number; previewUrl?: string; error?: string };
  logo: { ok: boolean; error?: string };
  hero: { ok: boolean; error?: string };
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
    logo: { ok: false },
    hero: { ok: false },
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

  // 3. Create an unpublished theme from Dawn
  let themeId: number | undefined;
  try {
    themeId = await createDawnTheme(session, `${wizard.brandName} — AI Draft`);
    await waitForThemeReady(session, themeId);
    result.theme = { ok: true, themeId, previewUrl: themeEditorUrl(session.shop, themeId) };
  } catch (err) {
    result.theme = { ok: false, error: String(err) };
  }

  // 4. Best-effort: brand logo + homepage hero copy
  if (themeId) {
    if (wizard.brandLogoDataUrl) {
      try {
        await setThemeLogo(session, themeId, wizard.brandLogoDataUrl);
        result.logo = { ok: true };
      } catch (err) {
        result.logo = { ok: false, error: String(err) };
      }
    } else {
      result.logo = { ok: false, error: "No logo was uploaded" };
    }

    try {
      await setHomepageHero(session, themeId, sitePlan.home);
      result.hero = { ok: true };
    } catch (err) {
      result.hero = { ok: false, error: String(err) };
    }
  }

  return result;
}
