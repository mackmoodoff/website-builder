import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;

export type ScrapedProduct = {
  title: string;
  images: string[];
  priceRange?: string;
};

export type ScrapedSite = {
  url: string;
  ok: boolean;
  title?: string;
  description?: string;
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
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (!src || looksLikeIcon(src)) return;
    const abs = absoluteUrl(src, url);
    if (abs) imageSet.add(abs);
  });

  return {
    ok: true,
    title: title?.trim(),
    description: description?.trim(),
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
      images: htmlResult.images ?? [],
      products: shopifyProducts ?? [],
      error: htmlResult.error,
    };
  } catch (err) {
    return { url, ok: false, images: [], products: [], error: String(err) };
  }
}
