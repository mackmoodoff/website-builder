const KIE_BASE_URL = "https://api.kie.ai";

function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new Error("Missing required env var: KIE_API_KEY");
  }
  return key;
}

async function createTask(prompt: string): Promise<string> {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2-text-to-image",
      input: { prompt, aspect_ratio: "1:1" },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 200 || !data.data?.taskId) {
    throw new Error(`KIE createTask failed: ${data.msg || res.status}`);
  }
  return data.data.taskId;
}

// KIE generation is async: poll recordInfo with backoff until success/fail.
async function pollTask(taskId: string, timeoutMs = 120_000): Promise<string> {
  const start = Date.now();
  let delay = 2000;
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    const data = await res.json();
    const state = data.data?.state;

    if (state === "success") {
      const result = JSON.parse(data.data.resultJson);
      const url = result.resultUrls?.[0];
      if (!url) throw new Error("KIE task succeeded but returned no result URL");
      return url;
    }
    if (state === "fail") {
      throw new Error(`KIE task failed: ${data.data.failMsg || data.data.failCode || "unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 8000);
  }
  throw new Error("Timed out waiting for KIE image generation");
}

// Returns a remote https URL (KIE-hosted, expires ~24h) rather than base64.
export async function generateBrandedImage(params: {
  brandName: string;
  brandColor: string;
  productName: string;
  brief: string;
}): Promise<string> {
  const prompt = `Professional e-commerce product/banner photography for a brand called "${params.brandName}".
Product: ${params.productName}.
Brand accent color: ${params.brandColor} (use it tastefully in props, background, or lighting — do not paint it literally onto the product).
Style: clean, modern, minimal-to-no readable text or logos in the image, high-end studio lighting, suitable for a Shopify store homepage banner or product photo.
Creative direction: ${params.brief}`;

  const taskId = await createTask(prompt);
  return pollTask(taskId);
}
