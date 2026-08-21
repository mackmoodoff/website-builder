import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runWizardBuild } from "@/lib/wizard-build";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  // Fire the build in the background; the client polls /status for live progress.
  runWizardBuild(id).catch((err) => {
    console.error(`Wizard build ${id} crashed outside its own error handling:`, err);
  });

  return NextResponse.json({ ok: true, status: "building" }, { status: 202 });
}
