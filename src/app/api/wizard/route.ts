import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { marketByCode } from "@/lib/markets";

const bodySchema = z.object({
  shop: z.string().min(1),
  market: z.string().min(1),
  productName: z.string().min(1),
  productDescription: z.string().min(1),
  supplierUrl: z.string().url().optional().or(z.literal("")),
  brandName: z.string().min(1),
  brandLogoDataUrl: z.string().optional().or(z.literal("")),
  brandColor: z.string().min(1),
  storeEmail: z.string().email(),
  competitorLinks: z.array(z.string().url()).min(1),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  const market = marketByCode(data.market);
  if (!market) {
    return NextResponse.json({ error: "Unknown market" }, { status: 400 });
  }

  const wizard = await prisma.storeWizard.create({
    data: {
      shop: data.shop,
      market: market.code,
      language: market.language,
      productName: data.productName,
      productDescription: data.productDescription,
      supplierUrl: data.supplierUrl || null,
      brandName: data.brandName,
      brandLogoDataUrl: data.brandLogoDataUrl || null,
      brandColor: data.brandColor,
      storeEmail: data.storeEmail,
      competitorLinks: JSON.stringify(data.competitorLinks),
      status: "draft",
    },
  });

  return NextResponse.json({ wizardId: wizard.id });
}
