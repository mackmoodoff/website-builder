import type { Session } from "@shopify/shopify-api";

const API_VERSION = "2026-07";
const DAWN_THEME_ZIP = "https://github.com/Shopify/dawn/archive/refs/heads/main.zip";
const HERO_SECTION_TYPES = new Set(["image-banner", "slideshow"]);

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
  const result = await shopifyRest<{ theme: { id: number } }>(session, "/themes.json", {
    method: "POST",
    body: JSON.stringify({ theme: { name, src: DAWN_THEME_ZIP, role: "unpublished" } }),
  });
  return result.theme.id;
}

export async function waitForThemeReady(session: Session, themeId: number, maxAttempts = 30): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await shopifyRest<{ theme: { processing: boolean } }>(session, `/themes/${themeId}.json`);
    if (!result.theme.processing) {
      // The theme's file list can take a few extra seconds to become queryable
      // even after `processing` flips false — give it a buffer.
      await sleep(5000);
      return;
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for the Dawn theme copy to finish processing on Shopify");
}

async function getAsset(session: Session, themeId: number, key: string): Promise<string> {
  const path = `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await shopifyRest<{ asset: { value: string } }>(session, path);
      return result.asset.value;
    } catch (err) {
      lastErr = err;
      if (String(err).includes("404")) {
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function putAssetValue(session: Session, themeId: number, key: string, value: string): Promise<void> {
  await shopifyRest(session, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, value } }),
  });
}

async function putAssetAttachment(session: Session, themeId: number, key: string, base64: string): Promise<void> {
  await shopifyRest(session, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, attachment: base64 } }),
  });
}

/** Best-effort: upload the brand logo as a theme asset and point Dawn's "logo" setting at it. */
export async function setThemeLogo(session: Session, themeId: number, logoDataUrl: string): Promise<void> {
  const match = logoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Brand logo is not a valid base64 data URL");
  const extension = match[1].split("/")[1] || "png";
  const assetKey = `assets/ai-store-builder-logo.${extension}`;

  await putAssetAttachment(session, themeId, assetKey, match[2]);

  const settingsRaw = await getAsset(session, themeId, "config/settings_data.json");
  const settings = JSON.parse(settingsRaw);
  if (settings.current && typeof settings.current === "object") {
    settings.current.logo = `ai-store-builder-logo.${extension}`;
    await putAssetValue(session, themeId, "config/settings_data.json", JSON.stringify(settings));
  } else {
    throw new Error("settings_data.json did not have the expected shape (current object)");
  }
}

/** Best-effort: find the homepage hero-like section and override its heading/text blocks. */
export async function setHomepageHero(
  session: Session,
  themeId: number,
  hero: { heroHeading: string; heroSubheading: string },
): Promise<void> {
  const raw = await getAsset(session, themeId, "templates/index.json");
  const template = JSON.parse(raw);
  const sections = template.sections ?? {};

  const heroSectionEntry = Object.entries(sections).find(
    ([, section]) => HERO_SECTION_TYPES.has((section as { type?: string }).type ?? ""),
  );
  if (!heroSectionEntry) {
    throw new Error("Could not find a hero-like section (image-banner/slideshow) in templates/index.json");
  }

  const [, heroSection] = heroSectionEntry as [string, { blocks?: Record<string, { type?: string; settings?: Record<string, unknown> }> }];
  const blocks = heroSection.blocks ?? {};

  let patched = false;
  for (const block of Object.values(blocks)) {
    if (block.type === "heading" && block.settings) {
      block.settings.heading = hero.heroHeading;
      patched = true;
    }
    if (block.type === "text" && block.settings) {
      block.settings.text = hero.heroSubheading;
      patched = true;
    }
  }

  if (!patched) {
    throw new Error("Hero section had no heading/text blocks to patch");
  }

  await putAssetValue(session, themeId, "templates/index.json", JSON.stringify(template));
}

export function themeEditorUrl(shop: string, themeId: number): string {
  return `https://${shop}/admin/themes/${themeId}/editor`;
}
