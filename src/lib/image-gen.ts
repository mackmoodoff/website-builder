import OpenAI from "openai";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required env var: OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

export async function generateBrandedImage(params: {
  brandName: string;
  brandColor: string;
  productName: string;
  brief: string;
}): Promise<string> {
  const client = getClient();

  const prompt = `Professional e-commerce product/banner photography for a brand called "${params.brandName}".
Product: ${params.productName}.
Brand accent color: ${params.brandColor} (use it tastefully in props, background, or lighting — do not paint it literally onto the product).
Style: clean, modern, minimal-to-no readable text or logos in the image, high-end studio lighting, suitable for a Shopify store homepage banner or product photo.
Creative direction: ${params.brief}`;

  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Image generation returned no data");
  }
  return `data:image/png;base64,${b64}`;
}
