-- Staff security codes (Empire plan, multi-branch). Everything is optional
-- and off: no tenant's behaviour changes until its owner turns it on.
ALTER TABLE "plans" ADD COLUMN "featureStaffCode" BOOLEAN NOT NULL DEFAULT false;
UPDATE "plans" SET "featureStaffCode" = true WHERE "code" = 'EMPIRE';

ALTER TABLE "tenants" ADD COLUMN "requireStaffCode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users" ADD COLUMN "staffCodeHash" TEXT;
CREATE UNIQUE INDEX "users_tenantId_staffCodeHash_key" ON "users"("tenantId", "staffCodeHash");

ALTER TABLE "pending_orders" ADD COLUMN "takenById" TEXT;
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "servedById" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The Sales register report (every sale with who took the order and who took
-- payment) comes with the Empire plan; other plans can add it in the ops console.
UPDATE "plans" SET "enabledReports" = "enabledReports" || '["sales-register"]'::jsonb
WHERE "code" = 'EMPIRE' AND NOT ("enabledReports" @> '["sales-register"]'::jsonb);
