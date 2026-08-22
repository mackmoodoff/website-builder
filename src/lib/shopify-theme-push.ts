import type { Session } from "@shopify/shopify-api";

const API_VERSION = "2026-07";

// Shopify's server-side fetch of the Dawn zip directly from GitHub was
// intermittently coming back empty (transient GitHub-side flakiness, outside
// our control). We serve our own cached copy instead — see
// /api/dawn-theme.zip and src/lib/dawn-local.ts — so Shopify fetches from our
// own tunnel, which is far more reliable.
function dawnThemeZipUrl(): string {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) throw new Error("Missing required env var: SHOPIFY_APP_URL");
  return `${appUrl}/api/dawn-theme.zip`;
}

function restUrl(shop: string, path: string): string {
  return `https://${shop}/admin/api/${API_VERSION}${path}`;
}

async function shopifyRest<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(restUrl(session.shop, path), {
    ...init,
    headers: {
      "X-Shopify-Access-Token": session.accessToken ?? "",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify REST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createDawnTheme(session: Session, name: string): Promise<number> {
  const src = dawnThemeZipUrl();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await shopifyRest<{ theme: { id: number } }>(session, "/themes.json", {
        method: "POST",
        body: JSON.stringify({ theme: { name, src, role: "unpublished" } }),
      });
      return result.theme.id;
    } catch (err) {
      lastErr = err;
      if (String(err).includes('"src"') && attempt < 2) {
        await sleep(10_000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function waitForThemeReady(session: Session, themeId: number, maxAttempts = 30): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await shopifyRest<{ theme: { processing: boolean } }>(session, `/themes/${themeId}.json`);
    if (!result.theme.processing) {
      await sleep(5000);
      return;
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for the Dawn theme copy to finish processing on Shopify");
}

// Note: writing theme code (sections/templates/assets) via themeFilesUpsert or the
// REST Asset API requires a manual "theme access" exemption from Shopify for
// standard apps — without it, both are hard-blocked (403/404), not a bug in this
// code. See README for the exemption request link. Until/unless granted, logo and
// homepage copy are applied by the merchant in Shopify's own Theme Editor instead.

export function themeEditorUrl(shop: string, themeId: number): string {
  return `https://${shop}/admin/themes/${themeId}/editor`;
}
