import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({
    where: { id },
    select: {
      status: true,
      buildLog: true,
      sitePlan: true,
      error: true,
      themeId: true,
      themePreviewUrl: true,
    },
  });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: wizard.status,
    buildLog: JSON.parse(wizard.buildLog),
    sitePlan: wizard.sitePlan ? JSON.parse(wizard.sitePlan) : null,
    error: wizard.error,
    themeId: wizard.themeId,
    themePreviewUrl: wizard.themePreviewUrl,
  });
}
