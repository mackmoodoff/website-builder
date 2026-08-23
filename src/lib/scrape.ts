import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;

export type ScrapedProduct = {
  title: string;
  images: string[];
  priceRange?: string;
  bodyText?: string;
};

export type ScrapedSite = {
  url: string;
  ok: boolean;
  title?: string;
  description?: string;
  headings?: string[];
  bodyExcerpt?: string;
  images: string[];
  products: ScrapedProduct[];
  error?: string;
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function absoluteUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function looksLikeIcon(src: string): boolean {
  return /favicon|sprite|icon-|\.svg(\?|$)|logo/i.test(src);
}

/** Picks the first URL out of a `srcset`/`data-srcset` attribute (format: "url 1x, url2 2x, ..."). */
function firstFromSrcset(srcset: string): string | undefined {
  return srcset.split(",")[0]?.trim().split(/\s+/)[0];
}

/** Strips HTML tags down to plain text (used for Shopify product body_html). */
function stripHtml(html: string): string {
  return cheerio
    .load(html)("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

// Best-effort: most Shopify storefronts expose a public /products.json endpoint
// unless password-protected. This gives structured data instead of scraping HTML.
async function tryShopifyProductsJson(baseUrl: string): Promise<ScrapedProduct[] | null> {
  try {
    const url = new URL("/products.json?limit=12", baseUrl).toString();
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.products)) return null;

    return data.products.slice(0, 12).map(
      (p: {
        title?: string;
        body_html?: string;
        images?: { src: string }[];
        variants?: { price?: string }[];
      }): ScrapedProduct => {
        const prices = (p.variants ?? [])
          .map((v) => Number(v.price))
          .filter((n) => Number.isFinite(n));
        const priceRange =
          prices.length > 0
            ? prices.length === 1 || Math.min(...prices) === Math.max(...prices)
              ? `$${Math.min(...prices).toFixed(2)}`
              : `$${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`
            : undefined;
        return {
          title: p.title ?? "Untitled product",
          images: (p.images ?? []).map((img) => img.src).filter(Boolean),
          priceRange,
          bodyText: p.body_html ? stripHtml(p.body_html).slice(0, 600) : undefined,
        };
      },
    );
  } catch {
    return null;
  }
}

async function scrapeHtml(url: string): Promise<Omit<ScrapedSite, "url" | "products">> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    return { ok: false, images: [], error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr("content") || $("title").first().text() || undefined;
  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    undefined;

  const imageSet = new Set<string>();
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    const abs = absoluteUrl(ogImage, url);
    if (abs) imageSet.add(abs);
  }
  const addImageCandidate = (src: string | undefined) => {
    if (!src || looksLikeIcon(src)) return;
    const abs = absoluteUrl(src, url);
    if (abs) imageSet.add(abs);
  };
  $("img").each((_, el) => {
    addImageCandidate($(el).attr("src") || $(el).attr("data-src"));
    const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
    if (srcset) addImageCandidate(firstFromSrcset(srcset));
  });
  // <picture><source>/<video> — covers animated GIFs served as srcset variants
  // or as autoplaying muted MP4 loops (a common lightweight "GIF" replacement).
  $("picture source, video source").each((_, el) => {
    const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
    if (srcset) addImageCandidate(firstFromSrcset(srcset));
    addImageCandidate($(el).attr("src"));
  });
  $("video").each((_, el) => {
    addImageCandidate($(el).attr("src"));
    addImageCandidate($(el).attr("poster"));
  });

  const headings = Array.from(
    new Set(
      $("h1, h2, h3")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 0 && t.length < 140),
    ),
  ).slice(0, 12);

  const bodyExcerpt = $("p")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length > 20)
    .join(" ")
    .slice(0, 1000);

  return {
    ok: true,
    title: title?.trim(),
    description: description?.trim(),
    headings,
    bodyExcerpt: bodyExcerpt || undefined,
    images: Array.from(imageSet).slice(0, 24),
  };
}

/**
 * Best-effort scrape of a competitor or supplier page. AliExpress and many
 * heavily JS-rendered sites will yield only meta-tag level data (title,
 * description, og:image) since we don't run a headless browser here.
 * Shopify-based competitor stores get richer data via /products.json.
 */
export async function scrapeSite(url: string): Promise<ScrapedSite> {
  try {
    const [htmlResult, shopifyProducts] = await Promise.all([
      scrapeHtml(url).catch(
        (err): Omit<ScrapedSite, "url" | "products"> => ({ ok: false, images: [], error: String(err) }),
      ),
      tryShopifyProductsJson(url),
    ]);

    return {
      url,
      ok: htmlResult.ok || Boolean(shopifyProducts),
      title: htmlResult.title,
      description: htmlResult.description,
      headings: htmlResult.headings,
      bodyExcerpt: htmlResult.bodyExcerpt,
      images: htmlResult.images ?? [],
      products: shopifyProducts ?? [],
      error: htmlResult.error,
    };
  } catch (err) {
    return { url, ok: false, images: [], products: [], error: String(err) };
  }
}
