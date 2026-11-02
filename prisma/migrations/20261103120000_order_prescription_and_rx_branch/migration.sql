-- A prescription can travel with an order sent to the cashier, and each
-- prescription remembers its branch. Both columns are optional; existing rows
-- are untouched (older prescriptions keep no branch).
ALTER TABLE "pending_orders" ADD COLUMN "prescription" JSONB;

ALTER TABLE "prescriptions" ADD COLUMN "storeId" TEXT;
CREATE INDEX "prescriptions_tenantId_storeId_idx" ON "prescriptions"("tenantId", "storeId");
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
