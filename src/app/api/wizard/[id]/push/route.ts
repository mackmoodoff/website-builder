import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionStorage } from "@/lib/shopify";
import { pushWizardToShopify } from "@/lib/wizard-push";
import { sitePlanSchema } from "@/lib/site-plan";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({
    where: { id },
    include: { images: { where: { selected: true } } },
  });
  if (!wizard || !wizard.sitePlan) {
    return NextResponse.json({ error: "Wizard not found or not built yet" }, { status: 404 });
  }

  const session = await sessionStorage.loadSession(`offline_${wizard.shop}`);
  if (!session) {
    return NextResponse.json({ error: "Store is not connected. Reconnect via /api/auth?shop=..." }, { status: 401 });
  }

  const sitePlan = sitePlanSchema.parse(JSON.parse(wizard.sitePlan));
  const selectedImageUrls = wizard.images.map((img) => img.dataUrl);

  try {
    const result = await pushWizardToShopify(
      session,
      {
        productName: wizard.productName,
        brandName: wizard.brandName,
        brandColor: wizard.brandColor,
      },
      sitePlan,
      selectedImageUrls,
    );

    await prisma.storeWizard.update({
      where: { id },
      data: {
        status: result.theme.ok ? "pushed" : "failed",
        themeId: result.theme.themeId ? String(result.theme.themeId) : null,
        themePreviewUrl: result.theme.previewUrl ?? null,
        error: result.theme.ok ? null : (result.theme.error ?? null),
      },
    });

    return NextResponse.json({ result });
  } catch (err) {
    await prisma.storeWizard.update({ where: { id }, data: { status: "failed", error: String(err) } });
    return NextResponse.json({ error: "Push to Shopify failed", detail: String(err) }, { status: 502 });
  }
}
