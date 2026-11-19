-- CreateTable
CREATE TABLE "receipt_template_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paperWidth" INTEGER NOT NULL,
    "printMode" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "blocks" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_template_versions_tenantId_publishedAt_idx" ON "receipt_template_versions"("tenantId", "publishedAt");

-- AddForeignKey
ALTER TABLE "receipt_template_versions" ADD CONSTRAINT "receipt_template_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

