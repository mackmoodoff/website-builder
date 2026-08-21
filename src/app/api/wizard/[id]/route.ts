import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({
    where: { id },
    include: { images: { orderBy: { createdAt: "asc" } } },
  });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }
  return NextResponse.json({ wizard });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const competitorLinks: unknown = body?.competitorLinks;
  if (!Array.isArray(competitorLinks) || competitorLinks.length === 0 || !competitorLinks.every((l) => typeof l === "string")) {
    return NextResponse.json({ error: "competitorLinks must be a non-empty string array" }, { status: 400 });
  }

  const wizard = await prisma.storeWizard.update({
    where: { id },
    data: { competitorLinks: JSON.stringify(competitorLinks) },
  });
  return NextResponse.json({ wizard });
}
