-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "shiftId" TEXT;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The Overview report is back as its own report: plans that have reports get it.
UPDATE "plans" SET "enabledReports" = '["overview"]'::jsonb || "enabledReports"::jsonb
WHERE jsonb_typeof("enabledReports"::jsonb) = 'array'
  AND "enabledReports"::jsonb ? 'sales-summary'
  AND NOT ("enabledReports"::jsonb ? 'overview');
