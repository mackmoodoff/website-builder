import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import type { SitePlan } from "./site-plan";

const DAWN_ZIP_URL = "https://codeload.github.com/Shopify/dawn/zip/refs/heads/main";
const CACHE_DIR = path.join(process.cwd(), ".cache", "dawn-base");
const CACHE_MARKER = path.join(CACHE_DIR, ".ready");
const ZIP_CACHE_PATH = path.join(process.cwd(), ".cache", "dawn.zip");

async function downloadDawnBase(): Promise<void> {
  const res = await fetch(DAWN_ZIP_URL);
  if (!res.ok) throw new Error(`Failed to download Dawn theme zip: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  await fs.mkdir(path.dirname(ZIP_CACHE_PATH), { recursive: true });
  await fs.writeFile(ZIP_CACHE_PATH, buffer);

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
  if (fsSync.existsSync(CACHE_MARKER) && fsSync.existsSync(ZIP_CACHE_PATH)) return;
  await downloadDawnBase();
}

/**
 * Returns the raw Dawn theme zip bytes (downloaded once from GitHub, cached
 * locally). Served from our own /api/dawn-theme.zip so Shopify's theme `src`
 * fetch hits our (more reliable) tunnel instead of GitHub directly — Shopify's
 * server-side fetch of the GitHub zip was intermittently coming back empty.
 */
export async function getDawnZipBuffer(): Promise<Buffer> {
  await ensureDawnBaseCache();
  return fs.readFile(ZIP_CACHE_PATH);
}

export async function createDawnWorkingCopy(): Promise<string> {
  await ensureDawnBaseCache();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dawn-theme-"));
  await fs.cp(CACHE_DIR, workDir, { recursive: true });
  return workDir;
}

/** Escapes text for safe interpolation into static (non-Liquid-driven) HTML we author. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\{%/g, "&#123;&#37;");
}

function buildHeaderLiquid(brandColor: string): string {
  return `<header style="background:${brandColor};color:#fff;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
  <a href="{{ routes.root_url }}" style="color:#fff;font-size:22px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">{{ shop.name }}</a>
  <nav style="display:flex;gap:24px;flex-wrap:wrap;">
    {% for link in linklists.main-menu.links %}
      <a href="{{ link.url }}" style="color:#fff;text-decoration:none;font-size:15px;">{{ link.title }}</a>
    {% endfor %}
  </nav>
  <a href="{{ routes.cart_url }}" style="color:#fff;text-decoration:none;font-size:15px;">Cart ({{ cart.item_count }})</a>
</header>
{% schema %}
{ "name": "AI Store Builder Header" }
{% endschema %}`;
}

function buildFooterLiquid(): string {
  return `<footer style="background:#111111;color:#eeeeee;padding:56px 24px;text-align:center;">
  <p style="font-size:18px;font-weight:600;margin-bottom:12px;">{{ shop.name }}</p>
  <nav style="display:flex;justify-content:center;gap:20px;margin-bottom:20px;flex-wrap:wrap;">
    {% for link in linklists.footer.links %}
      <a href="{{ link.url }}" style="color:#cccccc;text-decoration:none;font-size:14px;">{{ link.title }}</a>
    {% endfor %}
  </nav>
  <p style="font-size:13px;color:#888888;">&copy; {{ "now" | date: "%Y" }} {{ shop.name }}. All rights reserved.</p>
</footer>
{% schema %}
{ "name": "AI Store Builder Footer" }
{% endschema %}`;
}

function buildHomeLiquid(hero: SitePlan["home"], brandColor: string): string {
  const featureBlocks = hero.sections
    .map(
      (s) => `    <div style="text-align:center;">
      <h3 style="font-size:20px;margin-bottom:12px;">${esc(s.heading)}</h3>
      <p style="color:#555555;line-height:1.6;">${esc(s.body)}</p>
    </div>`,
    )
    .join("\n");

  const testimonialBlocks = hero.testimonials
    .map(
      (t) => `    <div style="background:#ffffff;padding:28px;border-radius:8px;">
      <p style="font-style:italic;color:#333333;margin-bottom:16px;">&ldquo;${esc(t.quote)}&rdquo;</p>
      <p style="font-weight:600;color:${brandColor};">&mdash; ${esc(t.name)}</p>
    </div>`,
    )
    .join("\n");

  return `<section style="background:${brandColor};color:#fff;text-align:center;padding:120px 24px;">
  <h1 style="font-size:52px;margin-bottom:20px;font-weight:800;line-height:1.15;">${esc(hero.heroHeading)}</h1>
  <p style="font-size:22px;max-width:640px;margin:0 auto 36px;opacity:0.95;">${esc(hero.heroSubheading)}</p>
  <a href="/collections/all" style="display:inline-block;padding:16px 40px;background:#fff;color:#111;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">${esc(hero.heroCta)}</a>
</section>

<section style="padding:80px 24px;max-width:1100px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:40px;">
${featureBlocks}
  </div>
</section>

<section style="background:#f7f7f7;padding:80px 24px;">
  <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px;">
${testimonialBlocks}
  </div>
</section>

<section style="text-align:center;padding:100px 24px;">
  <h2 style="font-size:36px;margin-bottom:16px;">${esc(hero.finalCtaHeading)}</h2>
  <p style="font-size:18px;color:#555555;margin-bottom:32px;">${esc(hero.finalCtaBody)}</p>
  <a href="/collections/all" style="display:inline-block;padding:16px 40px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">${esc(hero.heroCta)}</a>
</section>
{% schema %}
{ "name": "AI Store Builder Home" }
{% endschema %}`;
}

export async function injectStoreContent(
  dir: string,
  params: { home: SitePlan["home"]; brandColor: string },
): Promise<void> {
  await fs.writeFile(path.join(dir, "sections", "header.liquid"), buildHeaderLiquid(params.brandColor));
  await fs.writeFile(path.join(dir, "sections", "footer.liquid"), buildFooterLiquid());
  await fs.writeFile(
    path.join(dir, "sections", "ai-store-builder-home.liquid"),
    buildHomeLiquid(params.home, params.brandColor),
  );

  const indexTemplate = {
    sections: { ai_store_builder_home: { type: "ai-store-builder-home" } },
    order: ["ai_store_builder_home"],
  };
  await fs.writeFile(path.join(dir, "templates", "index.json"), JSON.stringify(indexTemplate, null, 2));
}

export async function cleanupWorkingCopy(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
