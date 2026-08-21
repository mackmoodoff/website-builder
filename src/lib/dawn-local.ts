import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

const DAWN_ZIP_URL = "https://codeload.github.com/Shopify/dawn/zip/refs/heads/main";
const CACHE_DIR = path.join(process.cwd(), ".cache", "dawn-base");
const CACHE_MARKER = path.join(CACHE_DIR, ".ready");

async function downloadDawnBase(): Promise<void> {
  const res = await fetch(DAWN_ZIP_URL);
  if (!res.ok) throw new Error(`Failed to download Dawn theme zip: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpZipDir = await fs.mkdtemp(path.join(os.tmpdir(), "dawn-zip-"));
  const zip = new AdmZip(buffer);
  zip.extractAllTo(tmpZipDir, true);

  // The zip contains a single top-level folder like "dawn-main/" — flatten it.
  const entries = await fs.readdir(tmpZipDir);
  const rootFolder = entries.find((e) => e.startsWith("dawn-"));
  if (!rootFolder) throw new Error("Unexpected Dawn zip layout: no dawn-* root folder found");

  await fs.rm(CACHE_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(CACHE_DIR), { recursive: true });
  await fs.rename(path.join(tmpZipDir, rootFolder), CACHE_DIR);
  await fs.rm(tmpZipDir, { recursive: true, force: true });
  await fs.writeFile(CACHE_MARKER, new Date().toISOString());
}

async function ensureDawnBaseCache(): Promise<void> {
  if (fsSync.existsSync(CACHE_MARKER)) return;
  await downloadDawnBase();
}

export async function createDawnWorkingCopy(): Promise<string> {
  await ensureDawnBaseCache();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dawn-theme-"));
  await fs.cp(CACHE_DIR, workDir, { recursive: true });
  return workDir;
}

function escapeLiquidText(text: string): string {
  return text.replace(/\{\{/g, "&#123;&#123;").replace(/\{%/g, "&#123;&#37;");
}

export async function injectStoreContent(
  dir: string,
  params: {
    logoDataUrl: string | null;
    hero: { heroHeading: string; heroSubheading: string };
    brandColor: string;
  },
): Promise<void> {
  let logoImgTag = "";
  let logoFilename: string | null = null;

  if (params.logoDataUrl) {
    const match = params.logoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const extension = match[1].split("/")[1] || "png";
      logoFilename = `ai-store-builder-logo.${extension}`;
      await fs.writeFile(path.join(dir, "assets", logoFilename), Buffer.from(match[2], "base64"));
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
  await fs.writeFile(path.join(dir, "sections", "ai-store-builder-hero.liquid"), heroLiquid);

  const indexTemplate = {
    sections: { ai_store_builder_hero: { type: "ai-store-builder-hero" } },
    order: ["ai_store_builder_hero"],
  };
  await fs.writeFile(path.join(dir, "templates", "index.json"), JSON.stringify(indexTemplate, null, 2));

  if (logoFilename) {
    const settingsPath = path.join(dir, "config", "settings_data.json");
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
    if (settings.current && typeof settings.current === "object") {
      settings.current.logo = logoFilename;
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    }
  }
}

export async function cleanupWorkingCopy(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
