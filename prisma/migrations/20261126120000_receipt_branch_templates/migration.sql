-- A branch's own receipt design; branches without one print the workspace design.
CREATE TABLE "receipt_branch_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
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

    CONSTRAINT "receipt_branch_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipt_branch_templates_storeId_key" ON "receipt_branch_templates"("storeId");
CREATE UNIQUE INDEX "receipt_branch_templates_tenantId_storeId_key" ON "receipt_branch_templates"("tenantId", "storeId");

ALTER TABLE "receipt_branch_templates" ADD CONSTRAINT "receipt_branch_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receipt_branch_templates" ADD CONSTRAINT "receipt_branch_templates_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Version history per design: null = the workspace design.
ALTER TABLE "receipt_template_versions" ADD COLUMN "storeId" TEXT;
CREATE INDEX "receipt_template_versions_tenantId_storeId_publishedAt_idx" ON "receipt_template_versions"("tenantId", "storeId", "publishedAt");
