import Anthropic from "@anthropic-ai/sdk";
import { storePlanSchema, type StorePlan } from "./store-plan";

const MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required env var: ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `You are a Shopify store copywriter and information architect.
Given a short business description, produce a complete starter store plan: brand
copy, homepage sections, informational pages, and a starter product catalog.
Respond with ONLY a single JSON object matching this shape, no prose, no markdown fences:

{
  "businessName": string,
  "tagline": string,
  "brandDescription": string,
  "navigation": string[] (2-6 short nav labels),
  "homepage": {
    "heroHeading": string,
    "heroSubheading": string,
    "sections": [{ "heading": string, "body": string }] (2-5 items)
  },
  "pages": [{ "title": string, "handle": string (url-safe slug), "bodyHtml": string }] (2-6 items, e.g. About, FAQ, Shipping & Returns, Contact),
  "products": [{ "title": string, "description": string, "priceRange": string, "tags": string[] (max 5) }] (3-12 starter placeholder products fitting the brand)
}`;

export async function generateStorePlan(prompt: string): Promise<StorePlan> {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI response contained no text content");
  }

  const jsonText = extractJson(textBlock.text);
  const parsed = JSON.parse(jsonText);
  return storePlanSchema.parse(parsed);
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}
