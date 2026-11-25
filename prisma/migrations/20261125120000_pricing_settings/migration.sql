-- Owner pricing rules (Receipt designer › Apply to POS). Additive only:
-- existing sales get 0 / NULL, so they read and reprint exactly as before.

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "adjustmentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "adjustmentLabel" TEXT,
ADD COLUMN "roundingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pricing_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roundingStep" DECIMAL(6,2),
    "ruleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ruleLabel" TEXT NOT NULL DEFAULT 'Adjustment',
    "ruleExpr" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_settings_tenantId_key" ON "pricing_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
