-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "featureReceiptDesigner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "receipt_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paperWidth" INTEGER NOT NULL DEFAULT 58,
    "printMode" TEXT NOT NULL DEFAULT 'TEXT',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "draftBlocks" JSONB,
    "draftTheme" JSONB,
    "draftPaperWidth" INTEGER,
    "draftPrintMode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_templates_tenantId_key" ON "receipt_templates"("tenantId");

-- AddForeignKey
ALTER TABLE "receipt_templates" ADD CONSTRAINT "receipt_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

