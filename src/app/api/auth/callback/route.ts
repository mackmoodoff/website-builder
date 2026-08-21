import { NextRequest, NextResponse } from "next/server";
import { Session } from "@shopify/shopify-api";
import { sessionStorage } from "@/lib/shopify";
import { exchangeCodeForToken, verifyHmac, isValidShopDomain } from "@/lib/shopify-oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  const cookieShop = request.cookies.get("shopify_oauth_shop")?.value;

  if (!shop || !code || !state || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: "Invalid callback parameters" }, { status: 400 });
  }
  if (!cookieState || state !== cookieState || shop !== cookieShop) {
    return NextResponse.json({ error: "OAuth state mismatch, please try connecting again" }, { status: 400 });
  }

  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!apiSecret || !apiKey || !appUrl) {
    return NextResponse.json({ error: "Server is missing Shopify env vars" }, { status: 500 });
  }

  if (!verifyHmac(searchParams, apiSecret)) {
    return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 400 });
  }

  const tokenResponse = await exchangeCodeForToken({ shop, apiKey, apiSecret, code });

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state,
    isOnline: false,
  });
  session.accessToken = tokenResponse.access_token;
  session.scope = tokenResponse.scope;
  await sessionStorage.storeSession(session);

  const response = NextResponse.redirect(`${appUrl}/generate?shop=${encodeURIComponent(shop)}`);
  response.cookies.delete("shopify_oauth_state");
  response.cookies.delete("shopify_oauth_shop");
  return response;
}
