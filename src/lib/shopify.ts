import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "./db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const appUrl = new URL(requireEnv("SHOPIFY_APP_URL"));

export const shopify = shopifyApi({
  apiKey: requireEnv("SHOPIFY_API_KEY"),
  apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
  scopes: requireEnv("SHOPIFY_SCOPES").split(","),
  hostName: appUrl.host,
  hostScheme: appUrl.protocol.replace(":", "") as "https" | "http",
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
});

export const sessionStorage = new PrismaSessionStorage(prisma);
