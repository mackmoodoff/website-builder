import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required env var: ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

export const homeSectionSchema = z.object({
  heroHeading: z.string(),
  heroSubheading: z.string(),
  heroCta: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .min(3)
    .max(6),
  testimonials: z
    .array(z.object({ name: z.string(), quote: z.string() }))
    .min(2)
    .max(3),
  finalCtaHeading: z.string(),
  finalCtaBody: z.string(),
});

export const productPageSchema = z.object({
  headline: z.string(),
  bulletPoints: z.array(z.string()).min(3).max(6),
  trustBadges: z.array(z.string()).min(2).max(5),
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .min(3)
    .max(5),
});

export const cartCheckoutSchema = z.object({
  cartShippingNote: z.string(),
  cartUpsellMessage: z.string(),
  checkoutThankYouMessage: z.string(),
});

export const sitePlanSchema = z.object({
  home: homeSectionSchema,
  productPage: productPageSchema,
  cart: z.object({
    shippingNote: z.string(),
    upsellMessage: z.string(),
  }),
  checkoutBranding: z.object({
    thankYouMessage: z.string(),
  }),
});

export type SitePlan = z.infer<typeof sitePlanSchema>;

type BuildContext = {
  brandName: string;
  productName: string;
  productDescription: string;
  brandColor: string;
  language: string;
  competitorSummary: string;
};

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function callClaude(system: string, prompt: string): Promise<unknown> {
  const client = getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI response contained no text content");
  }
  return JSON.parse(extractJson(textBlock.text));
}

const CONTEXT_NOTE = `Important: this store's positioning is INSPIRED by the competitor's apparent
market focus (what they sell and how they frame it), not a copy — write 100% original copy.
Never reuse the competitor's exact wording. Write everything in {LANGUAGE}.`;

export async function generateHomeSection(ctx: BuildContext) {
  const system = `You are a direct-response e-commerce copywriter building a high-converting Shopify homepage.
${CONTEXT_NOTE.replace("{LANGUAGE}", ctx.language)}
Respond with ONLY a JSON object:
{
  "heroHeading": string,
  "heroSubheading": string,
  "heroCta": string (short button label, e.g. "Shop Now"),
  "sections": [{"heading": string, "body": string}] (3-6 feature/benefit blocks),
  "testimonials": [{"name": string (a plausible customer first name + initial), "quote": string (1-2 sentences)}] (2-3 items),
  "finalCtaHeading": string (closing call-to-action heading),
  "finalCtaBody": string (1 sentence)
}`;
  const prompt = `Brand: ${ctx.brandName}
Product: ${ctx.productName} — ${ctx.productDescription}
Brand accent color: ${ctx.brandColor}
Competitor reference (for tone/positioning only, do not copy): ${ctx.competitorSummary}`;
  return homeSectionSchema.parse(await callClaude(system, prompt));
}

export async function generateProductPage(ctx: BuildContext) {
  const system = `You are an e-commerce copywriter building a Shopify product page.
${CONTEXT_NOTE.replace("{LANGUAGE}", ctx.language)}
Respond with ONLY a JSON object:
{
  "headline": string,
  "bulletPoints": string[] (3-6 items),
  "trustBadges": string[] (2-5 short items),
  "faqs": [{"question": string, "answer": string (1-2 sentences)}] (3-5 common pre-purchase questions)
}`;
  const prompt = `Brand: ${ctx.brandName}
Product: ${ctx.productName} — ${ctx.productDescription}
Competitor reference (for tone/positioning only, do not copy): ${ctx.competitorSummary}`;
  return productPageSchema.parse(await callClaude(system, prompt));
}

export async function generateCartAndCheckout(ctx: BuildContext) {
  const system = `You are an e-commerce copywriter writing short cart and checkout microcopy for Shopify.
${CONTEXT_NOTE.replace("{LANGUAGE}", ctx.language)}
Respond with ONLY a JSON object: { "cartShippingNote": string, "cartUpsellMessage": string, "checkoutThankYouMessage": string }
Note: on a standard (non-Plus) Shopify plan, the checkout page itself cannot be fully redesigned —
only branding (logo/colors) and the thank-you message are customizable, which is why only
checkoutThankYouMessage is requested here.`;
  const prompt = `Brand: ${ctx.brandName}
Product: ${ctx.productName} — ${ctx.productDescription}`;
  return cartCheckoutSchema.parse(await callClaude(system, prompt));
}
