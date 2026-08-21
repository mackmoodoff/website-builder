-- CreateTable
CREATE TABLE "StoreWizard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "supplierUrl" TEXT,
    "brandName" TEXT NOT NULL,
    "brandLogoDataUrl" TEXT,
    "brandColor" TEXT NOT NULL,
    "storeEmail" TEXT NOT NULL,
    "competitorLinks" TEXT NOT NULL,
    "scrapedData" TEXT,
    "sitePlan" TEXT,
    "buildLog" TEXT NOT NULL DEFAULT '[]',
    "themeId" TEXT,
    "themePreviewUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wizardId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "dataUrl" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreImage_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "StoreWizard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StoreWizard_shop_idx" ON "StoreWizard"("shop");

-- CreateIndex
CREATE INDEX "StoreImage_wizardId_idx" ON "StoreImage"("wizardId");
