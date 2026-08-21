import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionStorage } from "@/lib/shopify";
import { pushStorePlanToShopify } from "@/lib/shopify-push";
import { storePlanSchema } from "@/lib/store-plan";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const projectId = body?.projectId;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const project = await prisma.storeProject.findUnique({ where: { id: projectId } });
  if (!project || !project.plan) {
    return NextResponse.json({ error: "Project not found or not generated yet" }, { status: 404 });
  }

  const session = await sessionStorage.loadSession(`offline_${project.shop}`);
  if (!session) {
    return NextResponse.json(
      { error: "Store is not connected. Reconnect via /api/auth?shop=..." },
      { status: 401 },
    );
  }

  const plan = storePlanSchema.parse(JSON.parse(project.plan));

  try {
    const result = await pushStorePlanToShopify(session, plan);
    await prisma.storeProject.update({ where: { id: projectId }, data: { status: "pushed" } });
    return NextResponse.json({ result });
  } catch (err) {
    await prisma.storeProject.update({
      where: { id: projectId },
      data: { status: "failed", error: String(err) },
    });
    return NextResponse.json({ error: "Push to Shopify failed", detail: String(err) }, { status: 502 });
  }
}
