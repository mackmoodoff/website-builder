import { prisma } from "./db";
import { generateHomeSection, generateProductPage, generateCartAndCheckout, type SitePlan } from "./site-plan";
import { marketByCode } from "./markets";
import type { ScrapedSite } from "./scrape";

type BuildLogEntry = {
  step: string;
  status: "in_progress" | "done" | "error";
  message: string;
  at: string;
};

async function appendLog(id: string, entry: BuildLogEntry) {
  const wizard = await prisma.storeWizard.findUnique({ where: { id }, select: { buildLog: true } });
  const log: BuildLogEntry[] = wizard ? JSON.parse(wizard.buildLog) : [];
  log.push(entry);
  await prisma.storeWizard.update({ where: { id }, data: { buildLog: JSON.stringify(log) } });
}

async function markStepDone(id: string, step: string, message: string) {
  await appendLog(id, { step, status: "done", message, at: new Date().toISOString() });
}

async function markStepStarted(id: string, step: string, message: string) {
  await appendLog(id, { step, status: "in_progress", message, at: new Date().toISOString() });
}

function summarizeCompetitor(site: ScrapedSite | undefined): string {
  if (!site) return "No competitor data available.";
  const parts = [site.title, site.description].filter(Boolean);
  if (site.headings && site.headings.length > 0) {
    parts.push(`Page headings: ${site.headings.join(" | ")}`);
  }
  if (site.bodyExcerpt) {
    parts.push(`Page copy excerpt: ${site.bodyExcerpt}`);
  }
  if (site.products.length > 0) {
    parts.push(`Sells products such as: ${site.products.map((p) => p.title).join(", ")}`);
    const withBody = site.products.find((p) => p.bodyText);
    if (withBody?.bodyText) {
      parts.push(`One product's description: ${withBody.bodyText}`);
    }
  }
  return parts.join(". ") || "No competitor data available.";
}

export async function runWizardBuild(id: string): Promise<void> {
  await prisma.storeWizard.update({ where: { id }, data: { status: "building", buildLog: "[]" } });
  await markStepStarted(id, "review", "Reviewing competitor & supplier reference data...");

  try {
    const wizard = await prisma.storeWizard.findUniqueOrThrow({ where: { id } });
    const market = marketByCode(wizard.market);
    const scraped = wizard.scrapedData ? JSON.parse(wizard.scrapedData) : {};
    const competitorSummary = summarizeCompetitor(scraped.competitor);

    const ctx = {
      brandName: wizard.brandName,
      productName: wizard.productName,
      productDescription: wizard.productDescription,
      brandColor: wizard.brandColor,
      language: market?.languageName ?? "English",
      competitorSummary,
    };

    await markStepDone(id, "review", "Reference data reviewed.");

    await markStepStarted(id, "home_copy", "Drafting homepage sections...");
    const home = await generateHomeSection(ctx);
    await markStepDone(id, "home_copy", `Homepage drafted: "${home.heroHeading}"`);

    await markStepStarted(id, "product_copy", "Drafting product page...");
    const productPage = await generateProductPage(ctx);
    await markStepDone(id, "product_copy", `Product page drafted: "${productPage.headline}"`);

    await markStepStarted(id, "cart_checkout", "Drafting cart & checkout messaging...");
    const cartCheckout = await generateCartAndCheckout(ctx);
    await markStepDone(id, "cart_checkout", "Cart & checkout messaging drafted.");

    const sitePlan: SitePlan = {
      home,
      productPage,
      cart: {
        shippingNote: cartCheckout.cartShippingNote,
        upsellMessage: cartCheckout.cartUpsellMessage,
      },
      checkoutBranding: {
        thankYouMessage: cartCheckout.checkoutThankYouMessage,
      },
    };

    await prisma.storeWizard.update({
      where: { id },
      data: { sitePlan: JSON.stringify(sitePlan), status: "built" },
    });
    await markStepDone(id, "complete", "Store plan is ready to push to Shopify.");
  } catch (err) {
    await prisma.storeWizard.update({
      where: { id },
      data: { status: "failed", error: String(err) },
    });
    await appendLog(id, { step: "error", status: "error", message: String(err), at: new Date().toISOString() });
  }
}
