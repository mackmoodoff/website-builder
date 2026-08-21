import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeSite, type ScrapedSite } from "@/lib/scrape";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wizard = await prisma.storeWizard.findUnique({ where: { id } });
  if (!wizard) {
    return NextResponse.json({ error: "Wizard not found" }, { status: 404 });
  }

  const competitorLinks: string[] = JSON.parse(wizard.competitorLinks);
  const mainCompetitor = competitorLinks[0];

  const [competitor, supplier] = await Promise.all([
    scrapeSite(mainCompetitor),
    wizard.supplierUrl ? scrapeSite(wizard.supplierUrl) : Promise.resolve(null),
  ]);

  const scrapedData = { competitor, supplier };

  const imagesToSeed: { source: string; dataUrl: string }[] = [];
  const pushImages = (site: ScrapedSite | null, source: string) => {
    if (!site) return;
    const fromProducts = site.products.flatMap((p) => p.images);
    const all = [...site.images, ...fromProducts];
    for (const url of all.slice(0, 10)) {
      imagesToSeed.push({ source, dataUrl: url });
    }
  };
  pushImages(competitor, "competitor");
  pushImages(supplier, "supplier");

  await prisma.$transaction([
    prisma.storeWizard.update({
      where: { id },
      data: { scrapedData: JSON.stringify(scrapedData), status: "materials" },
    }),
    ...imagesToSeed.map((img) =>
      prisma.storeImage.create({
        data: { wizardId: id, source: img.source, dataUrl: img.dataUrl, selected: false },
      }),
    ),
  ]);

  return NextResponse.json({ scrapedData, seededImages: imagesToSeed.length });
}
