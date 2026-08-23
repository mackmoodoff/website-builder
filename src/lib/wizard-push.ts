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

const PUBLICATIONS_QUERY = `#graphql
  query Publications {
    publications(first: 10) {
      nodes { id name }
    }
  }
`;

const PUBLISH_TO_CHANNEL = `#graphql
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

export type WizardPushResult = {
  product: { ok: boolean; productId?: string; error?: string; publishedToOnlineStore: boolean; publishError?: string };
  media: { attempted: number; uploaded: number; errors: string[] };
  theme: { ok: boolean; themeId?: string; previewUrl?: string; error?: string };
  // "auto": pushed via Shopify CLI (Theme Access token) — header/footer/homepage
  // are already live. "manual": CLI push wasn't available/configured, fell back
  // to a blank Dawn copy via the Admin API — these carry the exact copy for the
  // merchant to paste into the Theme Editor themselves.
  themeContent: { mode: "auto" } | { mode: "manual"; heading: string; subheading: string; reason: string };
};

export async function pushWizardToShopify(
  session: Session,
  wizard: {
    productName: string;
    brandName: string;
    brandColor: string;
  },
  sitePlan: SitePlan,
  selectedImageUrls: string[],
): Promise<WizardPushResult> {
  const client = new shopify.clients.Graphql({ session });

  const result: WizardPushResult = {
    product: { ok: false, publishedToOnlineStore: false },
    media: { attempted: selectedImageUrls.length, uploaded: 0, errors: [] },
    theme: { ok: false },
    themeContent: { mode: "manual", heading: "", subheading: "", reason: "not attempted" },
  };

  // 1. Create the product as Active
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
          status: "ACTIVE",
        },
      },
    });
    const errors = response.data?.productCreate?.userErrors ?? [];
    const productId = response.data?.productCreate?.product?.id;
    if (errors.length > 0 || !productId) {
      result.product = { ok: false, error: errors.map((e: { message: string }) => e.message).join("; "), publishedToOnlineStore: false };
    } else {
      result.product = { ok: true, productId, publishedToOnlineStore: false };
    }
  } catch (err) {
    result.product = { ok: false, error: String(err), publishedToOnlineStore: false };
  }

  // 1b. Publish it to the Online Store sales channel so it's actually visible
  // in the storefront — an Active product isn't listed anywhere by default.
  if (result.product.ok && result.product.productId) {
    try {
      const pubResponse = await client.request(PUBLICATIONS_QUERY);
      const publications = pubResponse.data?.publications?.nodes ?? [];
      const onlineStore = publications.find((p: { id: string; name: string }) => p.name === "Online Store");
      if (!onlineStore) {
        result.product.publishError = `No "Online Store" publication found. Available: ${publications.map((p: { name: string }) => p.name).join(", ") || "none"}`;
      } else {
        const publishResponse = await client.request(PUBLISH_TO_CHANNEL, {
          variables: { id: result.product.productId, input: [{ publicationId: onlineStore.id }] },
        });
        const publishErrors = publishResponse.data?.publishablePublish?.userErrors ?? [];
        result.product.publishedToOnlineStore = publishErrors.length === 0;
        if (publishErrors.length > 0) {
          result.product.publishError = publishErrors.map((e: { message: string }) => e.message).join("; ");
        }
      }
    } catch (err) {
      result.product.publishError = String(err);
    }
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

  // 3. Create an unpublished Dawn-based theme copy via the (reliable) Admin API,
  // then push a fully custom-authored header, footer, and homepage (written from
  // the AI site plan, not Dawn's default sections) onto it via the Shopify CLI —
  // this bypasses the Admin API's theme-file write restriction, since the CLI
  // acts as the merchant's own theme-editing session rather than a third-party
  // app. If the CLI push isn't available/configured, the theme still exists —
  // just the blank Dawn base — and the merchant gets paste-in instructions
  // instead. Product page / cart / checkout stay Shopify's own mechanics
  // (add-to-cart, checkout) — no theme, custom or otherwise, replaces those.
  let themeId: number | undefined;
  try {
    themeId = await createDawnTheme(session, `${wizard.brandName} — AI Draft`);
    await waitForThemeReady(session, themeId);
    result.theme = { ok: true, themeId: String(themeId), previewUrl: themeEditorUrl(session.shop, themeId) };
  } catch (err) {
    result.theme = { ok: false, error: String(err) };
  }

  if (themeId) {
    let workDir: string | undefined;
    try {
      workDir = await createDawnWorkingCopy();
      await injectStoreContent(workDir, {
        brandName: wizard.brandName,
        brandColor: wizard.brandColor,
        home: sitePlan.home,
        productPage: sitePlan.productPage,
      });
      const cliResult = await pushThemeViaCli({ shop: session.shop, path: workDir, themeId });
      result.theme.previewUrl = cliResult.editorUrl ?? result.theme.previewUrl;
      result.themeContent = { mode: "auto" };
    } catch (cliErr) {
      result.themeContent = {
        mode: "manual",
        heading: sitePlan.home.heroHeading,
        subheading: sitePlan.home.heroSubheading,
        reason: String(cliErr),
      };
    } finally {
      if (workDir) await cleanupWorkingCopy(workDir);
    }
  }

  return result;
}
