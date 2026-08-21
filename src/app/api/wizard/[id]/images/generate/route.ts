import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateBrandedImage } from "@/lib/image-gen";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const brief: string = typeof body?.brief === "string" && body.brief.trim() ? body.brief.trim() : "clean lifestyle product shot";
  const count: number = Math.min(Math.max(Number(body?.count) || 4, 1), 6);

  const results = await Promise.allSettled(
    Array.from({ length: count }).map(() =>
      generateBrandedImage({
        brandName: wizard.brandName,
        brandColor: wizard.brandColor,
        productName: wizard.productName,
        brief,
      }),
    ),
  );

  const created = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const image = await prisma.storeImage.create({
        data: { wizardId: id, source: "generated", prompt: brief, dataUrl: result.value, selected: false },
      });
      created.push(image);
    }
  }

  const failedCount = results.length - created.length;
  return NextResponse.json({ created, failedCount });
}
