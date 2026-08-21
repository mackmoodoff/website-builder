import type { Session } from "@shopify/shopify-api";
import { shopify } from "./shopify";
import type { StorePlan } from "./store-plan";

const PAGE_CREATE = `#graphql
  mutation PageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id title handle }
      userErrors { field message }
    }
  }
`;

const PRODUCT_CREATE = `#graphql
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key }
      userErrors { field message }
    }
  }
`;

const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop { id }
  }
`;

export type PushResult = {
  pages: { title: string; ok: boolean; error?: string }[];
  products: { title: string; ok: boolean; error?: string }[];
  brandMetafieldsOk: boolean;
};

export async function pushStorePlanToShopify(
  session: Session,
  plan: StorePlan,
): Promise<PushResult> {
  const client = new shopify.clients.Graphql({ session });

  const result: PushResult = {
    pages: [],
    products: [],
    brandMetafieldsOk: false,
  };

  for (const page of plan.pages) {
    try {
      const response = await client.request(PAGE_CREATE, {
        variables: {
          page: { title: page.title, handle: page.handle, body: page.bodyHtml },
        },
      });
      const errors = response.data?.pageCreate?.userErrors ?? [];
      if (errors.length > 0) {
        result.pages.push({ title: page.title, ok: false, error: errors.map((e: { message: string }) => e.message).join("; ") });
      } else {
        result.pages.push({ title: page.title, ok: true });
      }
    } catch (err) {
      result.pages.push({ title: page.title, ok: false, error: String(err) });
    }
  }

  for (const product of plan.products) {
    try {
      const response = await client.request(PRODUCT_CREATE, {
        variables: {
          product: {
            title: product.title,
            descriptionHtml: product.description,
            tags: product.tags,
            status: "DRAFT",
          },
        },
      });
      const errors = response.data?.productCreate?.userErrors ?? [];
      if (errors.length > 0) {
        result.products.push({ title: product.title, ok: false, error: errors.map((e: { message: string }) => e.message).join("; ") });
      } else {
        result.products.push({ title: product.title, ok: true });
      }
    } catch (err) {
      result.products.push({ title: product.title, ok: false, error: String(err) });
    }
  }

  try {
    const shopIdResponse = await client.request(SHOP_ID_QUERY);
    const shopId = shopIdResponse.data?.shop?.id;
    if (shopId) {
      const metaResponse = await client.request(METAFIELDS_SET, {
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "ai_store_builder",
              key: "tagline",
              type: "single_line_text_field",
              value: plan.tagline,
            },
            {
              ownerId: shopId,
              namespace: "ai_store_builder",
              key: "brand_description",
              type: "multi_line_text_field",
              value: plan.brandDescription,
            },
          ],
        },
      });
      result.brandMetafieldsOk = (metaResponse.data?.metafieldsSet?.userErrors ?? []).length === 0;
    }
  } catch {
    result.brandMetafieldsOk = false;
  }

  return result;
}
