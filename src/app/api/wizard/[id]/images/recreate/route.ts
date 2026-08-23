import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recreateImageInBrandStyle } from "@/lib/image-gen";
import { marketByCode } from "@/lib/markets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceImageId: string = typeof body?.imageId === "string" ? body.imageId : "";
  const sourceImage = sourceImageId
    ? await prisma.storeImage.findUnique({ where: { id: sourceImageId } })
    : null;
  if (!sourceImage || sourceImage.wizardId !== id) {
    return NextResponse.json({ error: "Reference image not found" }, { status: 404 });
  }

  const language = marketByCode(wizard.market)?.languageName ?? "English";

  try {
    const resultUrl = await recreateImageInBrandStyle({
      referenceImageUrl: sourceImage.dataUrl,
      brandName: wizard.brandName,
      brandColor: wizard.brandColor,
      productName: wizard.productName,
      language,
    });
    const image = await prisma.storeImage.create({
      data: {
        wizardId: id,
        source: "generated",
        prompt: `Recreated from reference (${sourceImage.source})`,
        dataUrl: resultUrl,
        selected: false,
      },
    });
    return NextResponse.json({ image });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
