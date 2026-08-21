import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MIN_SELECTED_IMAGES = 8;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const imageIds: string[] = Array.isArray(body?.imageIds) ? body.imageIds : [];

  if (imageIds.length < MIN_SELECTED_IMAGES) {
    return NextResponse.json(
      { error: `Select at least ${MIN_SELECTED_IMAGES} images (got ${imageIds.length})` },
      { status: 400 },
    );
  }

  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.storeImage.updateMany({ where: { wizardId: id }, data: { selected: false } }),
    prisma.storeImage.updateMany({
      where: { wizardId: id, id: { in: imageIds } },
      data: { selected: true },
    }),
    prisma.storeWizard.update({ where: { id }, data: { status: "creatives_ready" } }),
  ]);

  return NextResponse.json({ ok: true });
}
