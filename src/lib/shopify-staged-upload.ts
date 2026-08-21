import type { Session } from "@shopify/shopify-api";
import { shopify } from "./shopify";

const STAGED_UPLOADS_CREATE = `#graphql
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

/**
 * Ensures an image is reachable at a public https URL Shopify can fetch, for use as
 * `originalSource` in a productCreate media input. Remote http(s) URLs (scraped
 * competitor/supplier images) are passed through as-is; base64 data: URLs (AI-generated
 * images) are uploaded via Shopify's staged-upload flow first.
 */
export async function ensurePublicImageUrl(
  session: Session,
  imageUrl: string,
  filenameHint: string,
): Promise<string | null> {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  const decoded = dataUrlToBuffer(imageUrl);
  if (!decoded) return null;

  const extension = decoded.mimeType.split("/")[1] || "png";
  const client = new shopify.clients.Graphql({ session });

  const stagedResponse = await client.request(STAGED_UPLOADS_CREATE, {
    variables: {
      input: [
        {
          filename: `${filenameHint}.${extension}`,
          mimeType: decoded.mimeType,
          httpMethod: "POST",
          resource: "PRODUCT_IMAGE",
        },
      ],
    },
  });

  const target = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
  const errors = stagedResponse.data?.stagedUploadsCreate?.userErrors ?? [];
  if (!target || errors.length > 0) {
    throw new Error(`stagedUploadsCreate failed: ${errors.map((e: { message: string }) => e.message).join("; ")}`);
  }

  const form = new FormData();
  for (const param of target.parameters as { name: string; value: string }[]) {
    form.append(param.name, param.value);
  }
  form.append("file", new Blob([new Uint8Array(decoded.buffer)], { type: decoded.mimeType }), `${filenameHint}.${extension}`);

  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(`Staged upload POST failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  return target.resourceUrl;
}
