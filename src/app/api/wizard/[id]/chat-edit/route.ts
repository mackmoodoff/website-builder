import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { editSitePlan, type SitePlan } from "@/lib/site-plan";
import { marketByCode } from "@/lib/markets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }
  if (!wizard.sitePlan) {
    return NextResponse.json({ error: "No site plan to edit yet" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const message: string = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const current: SitePlan = JSON.parse(wizard.sitePlan);
  const language = marketByCode(wizard.market)?.languageName ?? "English";

  try {
    const updated = await editSitePlan(current, message, language);
    await prisma.storeWizard.update({ where: { id }, data: { sitePlan: JSON.stringify(updated) } });
    return NextResponse.json({ sitePlan: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
