import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateStorePlan } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const shop = body?.shop;
  const prompt = body?.prompt;

  if (!shop || typeof shop !== "string") {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
    return NextResponse.json({ error: "Describe your business in a bit more detail" }, { status: 400 });
  }

  const project = await prisma.storeProject.create({
    data: { shop, prompt, businessName: "", status: "draft" },
  });

  try {
    const plan = await generateStorePlan(prompt);
    const updated = await prisma.storeProject.update({
      where: { id: project.id },
      data: { status: "generated", plan: JSON.stringify(plan), businessName: plan.businessName },
    });
    return NextResponse.json({ projectId: updated.id, plan });
  } catch (err) {
    await prisma.storeProject.update({
      where: { id: project.id },
      data: { status: "failed", error: String(err) },
    });
    return NextResponse.json({ error: "AI generation failed", detail: String(err) }, { status: 502 });
  }
}
