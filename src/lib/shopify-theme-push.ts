import type { Session } from "@shopify/shopify-api";
import { shopify } from "./shopify";

const API_VERSION = "2026-07";
// Use codeload.github.com directly — github.com/.../archive/....zip is a redirect,
// and Shopify's theme src fetcher doesn't follow it (reports src as empty).
const DAWN_THEME_ZIP = "https://codeload.github.com/Shopify/dawn/zip/refs/heads/main";

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
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await shopifyRest<{ theme: { id: number } }>(session, "/themes.json", {
        method: "POST",
        body: JSON.stringify({ theme: { name, src: DAWN_THEME_ZIP, role: "unpublished" } }),
      });
      return result.theme.id;
    } catch (err) {
      lastErr = err;
      // Shopify fetching the Dawn zip from GitHub occasionally comes back empty
      // (transient GitHub-side hiccup, not our request) — retry a few times.
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

const THEME_FILES_UPSERT = `#graphql
  mutation ThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

function escapeLiquidText(text: string): string {
  return text.replace(/\{\{/g, "&#123;&#123;").replace(/\{%/g, "&#123;&#37;");
}

/**
 * Writes a fully self-contained hero section + homepage template (no read/merge of
 * existing theme files needed — this always creates/overwrites both from scratch),
 * and uploads the brand logo as a theme asset referenced directly from that section.
 */
export async function setThemeLogoAndHero(
  session: Session,
  themeId: number,
  params: {
    logoDataUrl: string | null;
    hero: { heroHeading: string; heroSubheading: string };
    brandColor: string;
  },
): Promise<void> {
  const client = new shopify.clients.Graphql({ session });
  const themeGid = `gid://shopify/OnlineStoreTheme/${themeId}`;

  const files: { filename: string; body: { type: "TEXT" | "BASE64"; value: string } }[] = [];

  let logoImgTag = "";
  if (params.logoDataUrl) {
    const match = params.logoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const extension = match[1].split("/")[1] || "png";
      const logoFilename = `ai-store-builder-logo.${extension}`;
      files.push({ filename: `assets/${logoFilename}`, body: { type: "BASE64", value: match[2] } });
      logoImgTag = `<img src="{{ '${logoFilename}' | asset_url }}" alt="logo" style="max-width:160px;margin-bottom:32px;">`;
    }
  }

  const heroLiquid = `<div style="background-color:${params.brandColor};color:#fff;text-align:center;padding:96px 24px;">
  ${logoImgTag}
  <h1 style="font-size:48px;margin-bottom:16px;">${escapeLiquidText(params.hero.heroHeading)}</h1>
  <p style="font-size:20px;margin-bottom:32px;">${escapeLiquidText(params.hero.heroSubheading)}</p>
  <a href="/collections/all" style="display:inline-block;padding:14px 32px;background:#fff;color:#111;text-decoration:none;border-radius:4px;font-weight:600;">Shop now</a>
</div>
{% schema %}
{ "name": "AI Store Builder Hero", "presets": [{ "name": "AI Store Builder Hero" }] }
{% endschema %}`;

  files.push({ filename: "sections/ai-store-builder-hero.liquid", body: { type: "TEXT", value: heroLiquid } });

  const indexTemplate = {
    sections: { ai_store_builder_hero: { type: "ai-store-builder-hero" } },
    order: ["ai_store_builder_hero"],
  };
  files.push({ filename: "templates/index.json", body: { type: "TEXT", value: JSON.stringify(indexTemplate) } });

  const response = await client.request(THEME_FILES_UPSERT, { variables: { themeId: themeGid, files } });
  const errors = response.data?.themeFilesUpsert?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`themeFilesUpsert failed: ${errors.map((e: { message: string }) => e.message).join("; ")}`);
  }
}

export function themeEditorUrl(shop: string, themeId: number): string {
  return `https://${shop}/admin/themes/${themeId}/editor`;
}
