import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthorizeUrl, isValidShopDomain } from "@/lib/shopify-oauth";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Missing or invalid ?shop=your-store.myshopify.com" },
      { status: 400 },
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!apiKey || !scopes || !appUrl) {
    return NextResponse.json({ error: "Server is missing Shopify env vars" }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${appUrl}/api/auth/callback`;
  const authorizeUrl = buildAuthorizeUrl({ shop, apiKey, scopes, redirectUri, state });

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  response.cookies.set("shopify_oauth_state", state, cookieOpts);
  response.cookies.set("shopify_oauth_shop", shop, cookieOpts);
  return response;
}
