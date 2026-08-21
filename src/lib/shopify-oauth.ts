import crypto from "node:crypto";

export function isValidShopDomain(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

export function buildAuthorizeUrl(params: {
  shop: string;
  apiKey: string;
  scopes: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://${params.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", params.apiKey);
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export function verifyHmac(searchParams: URLSearchParams, apiSecret: string): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");
  const digest = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");

  const digestBuf = Buffer.from(digest, "hex");
  const hmacBuf = Buffer.from(hmac, "hex");
  if (digestBuf.length !== hmacBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, hmacBuf);
}

export async function exchangeCodeForToken(params: {
  shop: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<{ access_token: string; scope: string }> {
  const response = await fetch(`https://${params.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: params.apiKey,
      client_secret: params.apiSecret,
      code: params.code,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
