-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "discountId" TEXT,
ADD COLUMN     "discountName" TEXT,
ADD COLUMN     "discountRate" TEXT,
ADD COLUMN     "discountVatExempt" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,2) NOT NULL,
    "maxAmount" DECIMAL(10,2),
    "vatExempt" BOOLEAN NOT NULL DEFAULT false,
    "asksForId" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discounts_tenantId_code_key" ON "discounts"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every existing workspace starts with exactly the discounts checkout has always offered.
INSERT INTO "discounts" ("id", "tenantId", "code", "name", "kind", "value", "vatExempt", "asksForId", "isSystem", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", d.code, d.name, 'PERCENT', d.value, d.vat_exempt, d.asks_for_id, d.is_system, d.sort_order, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
  ('SENIOR', 'Senior citizen', 20, true, true, true, 1),
  ('PWD', 'PWD', 20, true, true, true, 2),
  ('STUDENT', 'Student', 10, false, true, false, 3),
  ('EMPLOYEE', 'Employee', 15, false, false, false, 4)
) AS d(code, name, value, vat_exempt, asks_for_id, is_system, sort_order)
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- Past SC/PWD sales were VAT-exempt; record it so reprints keep printing them the same way.
UPDATE "sales" SET "discountVatExempt" = true WHERE "discountType" IN ('SENIOR', 'PWD');
