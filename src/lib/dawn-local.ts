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

const NEUTRAL_BG = "#faf7f2";
const INK = "#2a2420";

function tint(brandColor: string, pct: number, base = "#ffffff"): string {
  return `color-mix(in srgb, ${brandColor} ${pct}%, ${base})`;
}

function buildHeaderLiquid(brandColor: string, announcement: string): string {
  return `<div style="background:${INK};color:#fff;text-align:center;padding:8px 16px;font-size:13px;letter-spacing:0.02em;">
  ${esc(announcement)}
</div>
<header style="background:${NEUTRAL_BG};color:${INK};padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;border-bottom:1px solid rgba(0,0,0,0.06);">
  <a href="{{ routes.root_url }}" style="color:${INK};font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:24px;text-decoration:none;letter-spacing:0.01em;">{{ shop.name }}</a>
  <nav style="display:flex;gap:24px;flex-wrap:wrap;">
    {% for link in linklists.main-menu.links %}
      <a href="{{ link.url }}" style="color:${INK};text-decoration:none;font-size:14px;">{{ link.title }}</a>
    {% endfor %}
  </nav>
  <a href="{{ routes.cart_url }}" style="color:${INK};text-decoration:none;font-size:14px;">Cart ({{ cart.item_count }})</a>
</header>
{% schema %}
{ "name": "AI Store Builder Header" }
{% endschema %}`;
}

function buildFooterLiquid(brandColor: string): string {
  return `<footer style="background:${INK};color:#eeeeee;padding:56px 24px;text-align:center;">
  <p style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;margin-bottom:16px;">{{ shop.name }}</p>
  <nav style="display:flex;justify-content:center;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
    {% for link in linklists.footer.links %}
      <a href="{{ link.url }}" style="color:#cccccc;text-decoration:none;font-size:14px;">{{ link.title }}</a>
    {% endfor %}
  </nav>
  <div style="max-width:420px;margin:0 auto 24px;display:flex;gap:8px;">
    <input type="email" placeholder="Email address" style="flex:1;padding:12px 14px;border-radius:6px;border:none;font-size:14px;">
    <span style="display:inline-block;padding:12px 22px;background:${brandColor};color:#fff;border-radius:6px;font-weight:600;font-size:14px;white-space:nowrap;">Subscribe</span>
  </div>
  <p style="font-size:13px;color:#888888;">&copy; {{ "now" | date: "%Y" }} {{ shop.name }}. All rights reserved.</p>
</footer>
{% schema %}
{ "name": "AI Store Builder Footer" }
{% endschema %}`;
}

function buildHomeLiquid(
  hero: SitePlan["home"],
  brandColor: string,
  brandName: string,
  trustBadges: string[],
  faqs: { question: string; answer: string }[],
): string {
  const heroTint = tint(brandColor, 10, NEUTRAL_BG);
  const badgeBorder = tint(brandColor, 35, "#ffffff");

  const checklist = trustBadges
    .slice(0, 3)
    .map(
      (b) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:14px;color:${INK};">
      <span style="color:${brandColor};font-weight:700;">&#10003;</span> ${esc(b)}
    </span>`,
    )
    .join("\n      ");

  const featureBlocks = hero.sections
    .map(
      (s) => `    <div style="text-align:center;">
      <h3 style="font-size:19px;margin-bottom:10px;color:${INK};">${esc(s.heading)}</h3>
      <p style="color:#5a5248;line-height:1.6;">${esc(s.body)}</p>
    </div>`,
    )
    .join("\n");

  const comparisonRows = trustBadges
    .map(
      (b) => `    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);color:${INK};">${esc(b)}</td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;background:${tint(brandColor, 12, NEUTRAL_BG)};color:${brandColor};font-weight:700;">&#10003;</td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;color:#b5aca0;">&#10005;</td>
    </tr>`,
    )
    .join("\n");

  const testimonialBlocks = hero.testimonials
    .map(
      (t) => `    <div style="background:#ffffff;padding:28px;border-radius:10px;">
      <p style="font-style:italic;color:#3a342c;margin-bottom:16px;">&ldquo;${esc(t.quote)}&rdquo;</p>
      <p style="font-weight:600;color:${brandColor};">&mdash; ${esc(t.name)}</p>
    </div>`,
    )
    .join("\n");

  const faqBlocks = faqs
    .map(
      (f) => `    <details style="border-bottom:1px solid rgba(0,0,0,0.08);padding:18px 4px;">
      <summary style="cursor:pointer;font-weight:600;color:${INK};list-style:none;">${esc(f.question)}</summary>
      <p style="margin-top:12px;color:#5a5248;line-height:1.6;">${esc(f.answer)}</p>
    </details>`,
    )
    .join("\n");

  return `<section style="background:${NEUTRAL_BG};background:${heroTint};padding:100px 24px;text-align:center;">
  <span style="display:inline-block;padding:6px 18px;border-radius:999px;background:#fff;border:1px solid ${badgeBorder};color:${brandColor};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:24px;">${esc(brandName)}</span>
  <h1 style="font-size:48px;margin-bottom:18px;font-weight:800;line-height:1.15;color:${INK};">${esc(hero.heroHeading)}</h1>
  <p style="font-size:20px;max-width:640px;margin:0 auto 28px;color:#5a5248;font-style:italic;">${esc(hero.heroSubheading)}</p>
  <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:32px;">
      ${checklist}
  </div>
  <a href="/collections/all" style="display:inline-block;padding:16px 40px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">${esc(hero.heroCta)}</a>
</section>

<section style="padding:80px 24px;max-width:1100px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:40px;">
${featureBlocks}
  </div>
</section>

<section style="padding:80px 24px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="text-align:center;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:32px;margin-bottom:32px;color:${INK};">${esc(brandName)} Difference</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;">
      <thead>
        <tr>
          <td style="padding:14px 16px;font-weight:700;color:${INK};"></td>
          <td style="padding:14px 16px;text-align:center;font-weight:700;background:${brandColor};color:#fff;">${esc(brandName)}</td>
          <td style="padding:14px 16px;text-align:center;font-weight:700;color:#8a8175;">Others</td>
        </tr>
      </thead>
      <tbody>
${comparisonRows}
      </tbody>
    </table>
  </div>
</section>

<section style="background:${NEUTRAL_BG};padding:80px 24px;">
  <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px;">
${testimonialBlocks}
  </div>
</section>

<section style="padding:80px 24px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="text-align:center;font-size:32px;margin-bottom:32px;color:${INK};">Frequently Asked Questions</h2>
${faqBlocks}
  </div>
</section>

<section style="text-align:center;padding:100px 24px;">
  <h2 style="font-size:34px;margin-bottom:16px;color:${INK};">${esc(hero.finalCtaHeading)}</h2>
  <p style="font-size:18px;color:#5a5248;margin-bottom:32px;">${esc(hero.finalCtaBody)}</p>
  <a href="/collections/all" style="display:inline-block;padding:16px 40px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">${esc(hero.heroCta)}</a>
</section>
{% schema %}
{ "name": "AI Store Builder Home" }
{% endschema %}`;
}

export async function injectStoreContent(
  dir: string,
  params: {
    brandName: string;
    brandColor: string;
    home: SitePlan["home"];
    trustBadges: string[];
    faqs: { question: string; answer: string }[];
  },
): Promise<void> {
  const announcement = params.trustBadges[0] ?? params.home.heroCta;
  await fs.writeFile(path.join(dir, "sections", "header.liquid"), buildHeaderLiquid(params.brandColor, announcement));
  await fs.writeFile(path.join(dir, "sections", "footer.liquid"), buildFooterLiquid(params.brandColor));
  await fs.writeFile(
    path.join(dir, "sections", "ai-store-builder-home.liquid"),
    buildHomeLiquid(params.home, params.brandColor, params.brandName, params.trustBadges, params.faqs),
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
