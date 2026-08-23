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

/** Small inline SVGs (no external icon library) — currentColor so they inherit text color. */
function svgCheck(size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;"><circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15"/><path d="M6 10.5l2.5 2.5L14 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function svgStar(): string {
  return `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2.47 5.28 5.53.63-4.13 3.9 1.13 5.69L10 14.5l-4.99 2.5 1.13-5.69-4.13-3.9 5.53-.63L10 1.5z"/></svg>`;
}

function starRow(brandColor: string): string {
  return `<span style="display:inline-flex;gap:2px;color:${brandColor};">${svgStar()}${svgStar()}${svgStar()}${svgStar()}${svgStar()}</span>`;
}

/** Shared CSS (buttons, cards, badge glow, scroll-reveal) — injected once via the header, which Shopify renders on every page. */
function sharedStyleBlock(brandColor: string): string {
  const glow = tint(brandColor, 45, "transparent");
  return `<style>
  .asb-btn { transition: transform .2s ease, box-shadow .2s ease; box-shadow: 0 4px 16px ${glow}; }
  .asb-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 26px ${tint(brandColor, 55, "transparent")}; }
  .asb-card { transition: transform .25s ease, box-shadow .25s ease; }
  .asb-card:hover { transform: translateY(-5px); box-shadow: 0 14px 32px rgba(0,0,0,0.08); }
  .asb-badge-glow { box-shadow: 0 0 0 0 ${glow}; animation: asb-pulse 2.4s ease-in-out infinite; }
  @keyframes asb-pulse {
    0%, 100% { box-shadow: 0 0 0 0 ${glow}; }
    50% { box-shadow: 0 0 0 10px transparent; }
  }
  .asb-reveal { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s ease; }
  .asb-reveal.asb-in { opacity: 1; transform: none; }
  details.asb-faq[open] summary .asb-chevron { transform: rotate(45deg); }
  .asb-chevron { transition: transform .2s ease; display: inline-block; }
  .asb-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .asb-table-wrap table { min-width: 480px; }
  img { max-width: 100%; height: auto; }
  .asb-marquee-track { width: max-content; animation: asb-marquee 24s linear infinite; }
  @keyframes asb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
</style>`;
}

/** Scroll-reveal script — injected once via the footer, which renders on every page. */
function scrollRevealScript(): string {
  return `<script>
document.addEventListener('DOMContentLoaded', function () {
  var els = document.querySelectorAll('.asb-reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('asb-in'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('asb-in'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  els.forEach(function (el) { io.observe(el); });
});
</script>`;
}

function faqAccordionHtml(faqs: { question: string; answer: string }[], brandColor: string): string {
  return faqs
    .map(
      (f) => `    <details class="asb-faq" style="border-bottom:1px solid rgba(0,0,0,0.08);padding:18px 4px;">
      <summary style="cursor:pointer;font-weight:600;color:${INK};list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;">${esc(f.question)} <span class="asb-chevron" style="color:${brandColor};font-size:18px;">+</span></summary>
      <p style="margin-top:12px;color:#5a5248;line-height:1.6;">${esc(f.answer)}</p>
    </details>`,
    )
    .join("\n");
}

function buildHeaderLiquid(brandColor: string, announcement: string): string {
  return `${sharedStyleBlock(brandColor)}
<div style="background:${INK};color:#fff;text-align:center;padding:8px 16px;font-size:13px;letter-spacing:0.02em;">
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
    <span class="asb-btn" style="display:inline-block;padding:12px 22px;background:${brandColor};color:#fff;border-radius:6px;font-weight:600;font-size:14px;white-space:nowrap;">Subscribe</span>
  </div>
  <p style="font-size:13px;color:#888888;">&copy; {{ "now" | date: "%Y" }} {{ shop.name }}. All rights reserved.</p>
</footer>
${scrollRevealScript()}
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
      <span style="color:${brandColor};">${svgCheck(18)}</span> ${esc(b)}
    </span>`,
    )
    .join("\n      ");

  const featureBlocks = hero.sections
    .map(
      (s, i) => `    <div class="asb-reveal asb-card" style="text-align:center;background:#fff;padding:28px 20px;border-radius:12px;transition-delay:${i * 80}ms;">
      <div style="width:44px;height:44px;margin:0 auto 14px;border-radius:50%;background:${tint(brandColor, 15, NEUTRAL_BG)};color:${brandColor};display:flex;align-items:center;justify-content:center;font-weight:700;">${i + 1}</div>
      <h3 style="font-size:19px;margin-bottom:10px;color:${INK};">${esc(s.heading)}</h3>
      <p style="color:#5a5248;line-height:1.6;">${esc(s.body)}</p>
    </div>`,
    )
    .join("\n");

  const comparisonRows = trustBadges
    .map(
      (b) => `    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);color:${INK};">${esc(b)}</td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;background:${tint(brandColor, 12, NEUTRAL_BG)};color:${brandColor};">${svgCheck(18)}</td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;color:#c9beb0;font-size:16px;">&#10005;</td>
    </tr>`,
    )
    .join("\n");

  const testimonialBlocks = hero.testimonials
    .map(
      (t, i) => `    <div class="asb-reveal asb-card" style="background:#ffffff;padding:28px;border-radius:12px;transition-delay:${i * 80}ms;">
      ${starRow(brandColor)}
      <p style="font-style:italic;color:#3a342c;margin:12px 0 16px;">&ldquo;${esc(t.quote)}&rdquo;</p>
      <p style="font-weight:600;color:${brandColor};">&mdash; ${esc(t.name)}</p>
    </div>`,
    )
    .join("\n");

  const faqBlocks = faqAccordionHtml(faqs, brandColor);

  const marqueeItems = trustBadges.length > 0 ? trustBadges : [brandName];
  const marqueeRow = marqueeItems
    .map(
      (b) => `<span style="display:inline-flex;align-items:center;gap:8px;padding:0 28px;color:#fff;font-size:14px;font-weight:600;letter-spacing:0.02em;">
        <span style="color:${brandColor};">${svgCheck(16)}</span>${esc(b)}
      </span>`,
    )
    .join("\n      ");

  const collectionGrid = `{% assign asb_products = collections.all.products %}
  {% if asb_products.size > 0 %}
  <section class="asb-reveal" style="padding:clamp(48px,10vw,80px) 20px;max-width:1160px;margin:0 auto;">
    <h2 style="text-align:center;font-size:clamp(24px,5vw,32px);margin-bottom:32px;color:${INK};">Shop {{ shop.name }}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;">
      {% for product in asb_products limit: 6 %}
        <a href="{{ product.url }}" class="asb-reveal asb-card" style="display:block;text-decoration:none;color:inherit;background:#fff;border-radius:12px;overflow:hidden;transition-delay:{{ forloop.index0 | times: 60 }}ms;">
          <div style="aspect-ratio:1/1;background:${NEUTRAL_BG};">
            {% if product.featured_image %}
              {{ product.featured_image | image_url: width: 500 | image_tag: loading: 'lazy', style: 'width:100%;height:100%;object-fit:cover;display:block;' }}
            {% endif %}
          </div>
          <div style="padding:16px;">
            <p style="font-weight:600;color:${INK};margin-bottom:6px;">{{ product.title }}</p>
            <p style="color:${brandColor};font-weight:700;">{{ product.price | money }}</p>
          </div>
        </a>
      {% endfor %}
    </div>
  </section>
  {% endif %}`;

  return `<section class="asb-reveal" style="background:${NEUTRAL_BG};background:${heroTint};padding:clamp(56px,12vw,100px) 20px;text-align:center;">
  <span class="asb-badge-glow" style="display:inline-block;padding:6px 18px;border-radius:999px;background:#fff;border:1px solid ${badgeBorder};color:${brandColor};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:24px;">${esc(brandName)}</span>
  <h1 style="font-size:clamp(28px,6vw,48px);margin-bottom:18px;font-weight:800;line-height:1.15;color:${INK};">${esc(hero.heroHeading)}</h1>
  <p style="font-size:clamp(16px,3vw,20px);max-width:640px;margin:0 auto 28px;color:#5a5248;font-style:italic;">${esc(hero.heroSubheading)}</p>
  <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:32px;">
      ${checklist}
  </div>
  <a href="/collections/all" class="asb-btn" style="display:inline-block;padding:16px 40px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">${esc(hero.heroCta)}</a>
</section>

<div style="overflow:hidden;background:${INK};padding:14px 0;">
  <div class="asb-marquee-track" style="display:flex;">
    <div style="display:flex;flex-shrink:0;">${marqueeRow}</div>
    <div style="display:flex;flex-shrink:0;" aria-hidden="true">${marqueeRow}</div>
  </div>
</div>

${collectionGrid}

<section style="padding:clamp(48px,10vw,80px) 20px;max-width:1100px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px;">
${featureBlocks}
  </div>
</section>

<section class="asb-reveal" style="padding:clamp(48px,10vw,80px) 20px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="text-align:center;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:clamp(24px,5vw,32px);margin-bottom:32px;color:${INK};">${esc(brandName)} Difference</h2>
    <div class="asb-table-wrap">
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.05);">
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
  </div>
</section>

<section style="background:${NEUTRAL_BG};padding:clamp(48px,10vw,80px) 20px;">
  <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px;">
${testimonialBlocks}
  </div>
</section>

<section class="asb-reveal" style="padding:clamp(48px,10vw,80px) 20px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="text-align:center;font-size:clamp(24px,5vw,32px);margin-bottom:32px;color:${INK};">Frequently Asked Questions</h2>
${faqBlocks}
  </div>
</section>

<section class="asb-reveal" style="text-align:center;padding:clamp(56px,12vw,100px) 20px;background:${heroTint};">
  <h2 style="font-size:clamp(26px,5vw,34px);margin-bottom:16px;color:${INK};">${esc(hero.finalCtaHeading)}</h2>
  <p style="font-size:18px;color:#5a5248;margin-bottom:32px;">${esc(hero.finalCtaBody)}</p>
  <a href="/collections/all" class="asb-btn" style="display:inline-block;padding:16px 40px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">${esc(hero.heroCta)}</a>
</section>
{% schema %}
{ "name": "AI Store Builder Home" }
{% endschema %}`;
}

function buildProductLiquid(
  productPage: SitePlan["productPage"],
  brandColor: string,
  testimonials: { name: string; quote: string }[],
): string {
  const { headline, bulletPoints, trustBadges, faqs } = productPage;

  const testimonialBlocks = testimonials
    .map(
      (t, i) => `    <div class="asb-reveal asb-card" style="background:#ffffff;padding:28px;border-radius:12px;transition-delay:${i * 80}ms;">
      ${starRow(brandColor)}
      <p style="font-style:italic;color:#3a342c;margin:12px 0 16px;">&ldquo;${esc(t.quote)}&rdquo;</p>
      <p style="font-weight:600;color:${brandColor};">&mdash; ${esc(t.name)}</p>
    </div>`,
    )
    .join("\n");

  const howItWorksSteps = [
    { label: "Order", body: "Pick your option and check out securely in a couple of clicks." },
    { label: "Ship", body: "We carefully pack and ship your order straight to your door." },
    { label: "Enjoy", body: "Unbox it and start using it the same day it arrives." },
  ]
    .map(
      (s, i) => `    <div class="asb-reveal asb-card" style="text-align:center;background:#fff;padding:28px 20px;border-radius:12px;transition-delay:${i * 80}ms;">
      <div style="width:44px;height:44px;margin:0 auto 14px;border-radius:50%;background:${tint(brandColor, 15, NEUTRAL_BG)};color:${brandColor};display:flex;align-items:center;justify-content:center;font-weight:700;">${i + 1}</div>
      <h3 style="font-size:18px;margin-bottom:8px;color:${INK};">${esc(s.label)}</h3>
      <p style="color:#5a5248;line-height:1.6;font-size:14px;">${esc(s.body)}</p>
    </div>`,
    )
    .join("\n");

  const bulletItems = bulletPoints
    .map(
      (b) => `      <li style="display:flex;align-items:flex-start;gap:10px;font-size:15px;color:${INK};line-height:1.5;">
        <span style="color:${brandColor};margin-top:2px;">${svgCheck(18)}</span><span>${esc(b)}</span>
      </li>`,
    )
    .join("\n");

  const trustChips = trustBadges
    .map(
      (b) => `    <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:${tint(brandColor, 10, NEUTRAL_BG)};color:${INK};font-size:13px;font-weight:600;">
      <span style="color:${brandColor};">${svgCheck(16)}</span>${esc(b)}
    </span>`,
    )
    .join("\n");

  const trustCards = trustBadges
    .map(
      (b, i) => `    <div class="asb-reveal asb-card" style="text-align:center;background:#fff;padding:26px 18px;border-radius:12px;transition-delay:${i * 80}ms;">
      <div style="width:44px;height:44px;margin:0 auto 12px;border-radius:50%;background:${tint(brandColor, 15, NEUTRAL_BG)};color:${brandColor};display:flex;align-items:center;justify-content:center;">${svgCheck(22)}</div>
      <p style="font-weight:600;color:${INK};">${esc(b)}</p>
    </div>`,
    )
    .join("\n");

  const faqBlocks = faqAccordionHtml(faqs, brandColor);

  return `<section style="max-width:1160px;margin:0 auto;padding:clamp(32px,8vw,56px) 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:clamp(28px,6vw,48px);align-items:start;">
  <div>
    <div style="position:relative;border-radius:14px;overflow:hidden;background:${NEUTRAL_BG};aspect-ratio:1/1;">
      {% if product.compare_at_price > product.price %}
        <span style="position:absolute;top:12px;left:12px;background:${brandColor};color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;z-index:2;">Sale</span>
      {% endif %}
      {% unless product.selected_or_first_available_variant.available %}
        <span style="position:absolute;top:12px;left:12px;background:${INK};color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;z-index:2;">Sold Out</span>
      {% endunless %}
      {% if product.selected_or_first_available_variant.featured_media %}
        {{ product.selected_or_first_available_variant.featured_media | image_url: width: 1000 | image_tag: id: 'asb-main-image', loading: 'eager', style: 'width:100%;height:100%;object-fit:cover;display:block;' }}
      {% elsif product.featured_media %}
        {{ product.featured_media | image_url: width: 1000 | image_tag: id: 'asb-main-image', loading: 'eager', style: 'width:100%;height:100%;object-fit:cover;display:block;' }}
      {% endif %}
    </div>
    {% if product.media.size > 1 %}
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
      {% for media in product.media %}
        <button type="button" class="asb-thumb asb-card" data-full="{{ media | image_url: width: 1000 }}" style="width:64px;height:64px;border-radius:8px;overflow:hidden;padding:0;border:1px solid rgba(0,0,0,0.1);cursor:pointer;background:none;">
          {{ media | image_url: width: 160 | image_tag: loading: 'lazy', style: 'width:100%;height:100%;object-fit:cover;display:block;' }}
        </button>
      {% endfor %}
    </div>
    {% endif %}
  </div>

  <div>
    <h1 style="font-size:clamp(26px,5vw,34px);font-weight:800;line-height:1.15;color:${INK};margin-bottom:14px;">{{ product.title }}</h1>
    <div style="margin-bottom:14px;">${starRow(brandColor)}</div>
    <p style="font-size:17px;color:#5a5248;margin-bottom:22px;">${esc(headline)}</p>
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:26px;">
      <span style="font-size:28px;font-weight:800;color:${INK};">{{ product.price | money }}</span>
      {% if product.compare_at_price > product.price %}
        <span style="text-decoration:line-through;color:#a89e90;font-size:16px;">{{ product.compare_at_price | money }}</span>
      {% endif %}
    </div>

    <ul style="list-style:none;padding:0;margin:0 0 30px;display:flex;flex-direction:column;gap:12px;">
${bulletItems}
    </ul>

    {% form 'product', product, id: 'asb-product-form' %}
      <input type="hidden" name="id" id="asb-variant-id" value="{{ product.selected_or_first_available_variant.id }}">
      {% for option in product.options_with_values %}
        <div style="margin-bottom:16px;">
          <label style="display:block;font-size:13px;font-weight:600;color:${INK};margin-bottom:6px;">{{ option.name }}</label>
          <select class="asb-option-select" data-option-index="{{ forloop.index0 }}" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.14);font-size:15px;background:#fff;">
            {% for value in option.values %}
              <option value="{{ value | escape }}">{{ value }}</option>
            {% endfor %}
          </select>
        </div>
      {% endfor %}
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
        <label style="font-size:13px;font-weight:600;color:${INK};">Qty</label>
        <div style="display:flex;align-items:center;border:1px solid rgba(0,0,0,0.14);border-radius:8px;overflow:hidden;">
          <button type="button" class="asb-qty-btn" data-action="dec" style="width:38px;height:38px;border:none;background:#fff;cursor:pointer;font-size:18px;color:${INK};">&minus;</button>
          <input type="number" name="quantity" id="asb-qty-input" value="1" min="1" style="width:48px;height:38px;text-align:center;border:none;border-left:1px solid rgba(0,0,0,0.1);border-right:1px solid rgba(0,0,0,0.1);">
          <button type="button" class="asb-qty-btn" data-action="inc" style="width:38px;height:38px;border:none;background:#fff;cursor:pointer;font-size:18px;color:${INK};">+</button>
        </div>
      </div>
      <button type="submit" name="add" id="asb-add-to-cart" class="asb-btn" {% unless product.selected_or_first_available_variant.available %}disabled{% endunless %} style="width:100%;padding:16px;background:${brandColor};color:#fff;border:none;border-radius:8px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px;">
        {% if product.selected_or_first_available_variant.available %}Add to Cart{% else %}Sold Out{% endif %}
      </button>
      {{ form | payment_button }}
    {% endform %}

    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:26px;">
${trustChips}
    </div>
  </div>
</section>

<div id="asb-sticky-bar" style="position:fixed;left:0;right:0;bottom:-100px;background:#fff;border-top:1px solid rgba(0,0,0,0.08);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 -6px 24px rgba(0,0,0,0.08);transition:bottom .3s ease;z-index:50;">
  <div style="display:flex;align-items:center;gap:12px;min-width:0;">
    <span style="font-weight:600;color:${INK};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ product.title }}</span>
    <span style="font-weight:700;color:${brandColor};flex-shrink:0;">{{ product.price | money }}</span>
  </div>
  {% if product.selected_or_first_available_variant.available %}
    <button type="button" id="asb-sticky-add" class="asb-btn" style="padding:12px 24px;background:${brandColor};color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Add to Cart</button>
  {% endif %}
</div>

<section style="background:${NEUTRAL_BG};padding:clamp(40px,8vw,72px) 20px;">
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:26px;">
${trustCards}
  </div>
</section>

<section style="padding:clamp(40px,8vw,72px) 20px;max-width:1000px;margin:0 auto;">
  <h2 style="text-align:center;font-size:clamp(22px,4vw,28px);margin-bottom:32px;color:${INK};">How It Works</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;">
${howItWorksSteps}
  </div>
</section>

${
  testimonialBlocks
    ? `<section style="background:${NEUTRAL_BG};padding:clamp(40px,8vw,72px) 20px;">
  <div style="max-width:900px;margin:0 auto;">
    <h2 style="text-align:center;font-size:clamp(22px,4vw,28px);margin-bottom:32px;color:${INK};">What Customers Say</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;">
${testimonialBlocks}
    </div>
  </div>
</section>`
    : ""
}

<section class="asb-reveal" style="padding:clamp(40px,8vw,72px) 20px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="text-align:center;font-size:clamp(24px,5vw,30px);margin-bottom:28px;color:${INK};">Frequently Asked Questions</h2>
${faqBlocks}
  </div>
</section>

<script type="application/json" id="asb-variants-json">{{ product.variants | json }}</script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var thumbs = document.querySelectorAll('.asb-thumb');
  var main = document.getElementById('asb-main-image');
  thumbs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (main && btn.dataset.full) { main.src = btn.dataset.full; }
    });
  });

  var variantsEl = document.getElementById('asb-variants-json');
  var selects = document.querySelectorAll('.asb-option-select');
  var hiddenInput = document.getElementById('asb-variant-id');
  if (variantsEl && selects.length && hiddenInput) {
    var variants = JSON.parse(variantsEl.textContent);
    function updateVariant() {
      var selected = Array.prototype.map.call(selects, function (s) { return s.value; });
      var match = variants.find(function (v) {
        return selected.every(function (val, i) { return v.options[i] === val; });
      });
      if (match) hiddenInput.value = match.id;
    }
    selects.forEach(function (s) { s.addEventListener('change', updateVariant); });
  }

  var qtyInput = document.getElementById('asb-qty-input');
  document.querySelectorAll('.asb-qty-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!qtyInput) return;
      var val = parseInt(qtyInput.value, 10) || 1;
      val = btn.dataset.action === 'inc' ? val + 1 : Math.max(1, val - 1);
      qtyInput.value = val;
    });
  });

  var stickyBar = document.getElementById('asb-sticky-bar');
  var mainForm = document.getElementById('asb-product-form');
  var stickyAdd = document.getElementById('asb-sticky-add');
  if (stickyBar && mainForm) {
    if ('IntersectionObserver' in window) {
      var stickyIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          stickyBar.style.bottom = entry.isIntersecting ? '-100px' : '0';
        });
      }, { threshold: 0 });
      stickyIo.observe(mainForm);
    }
    if (stickyAdd) {
      stickyAdd.addEventListener('click', function () {
        if (mainForm.requestSubmit) mainForm.requestSubmit();
        else mainForm.submit();
      });
    }
  }
});
</script>
{% schema %}
{ "name": "AI Store Builder Product" }
{% endschema %}`;
}

export async function injectStoreContent(
  dir: string,
  params: {
    brandName: string;
    brandColor: string;
    home: SitePlan["home"];
    productPage: SitePlan["productPage"];
  },
): Promise<void> {
  const announcement = params.productPage.trustBadges[0] ?? params.home.heroCta;
  await fs.writeFile(path.join(dir, "sections", "header.liquid"), buildHeaderLiquid(params.brandColor, announcement));
  await fs.writeFile(path.join(dir, "sections", "footer.liquid"), buildFooterLiquid(params.brandColor));
  await fs.writeFile(
    path.join(dir, "sections", "ai-store-builder-home.liquid"),
    buildHomeLiquid(
      params.home,
      params.brandColor,
      params.brandName,
      params.productPage.trustBadges,
      params.productPage.faqs,
    ),
  );
  await fs.writeFile(
    path.join(dir, "sections", "ai-store-builder-product.liquid"),
    buildProductLiquid(params.productPage, params.brandColor, params.home.testimonials),
  );

  const indexTemplate = {
    sections: { ai_store_builder_home: { type: "ai-store-builder-home" } },
    order: ["ai_store_builder_home"],
  };
  await fs.writeFile(path.join(dir, "templates", "index.json"), JSON.stringify(indexTemplate, null, 2));

  const productTemplate = {
    sections: { ai_store_builder_product: { type: "ai-store-builder-product" } },
    order: ["ai_store_builder_product"],
  };
  await fs.writeFile(path.join(dir, "templates", "product.json"), JSON.stringify(productTemplate, null, 2));
}

export async function cleanupWorkingCopy(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
