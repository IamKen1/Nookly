-- Cash and e-wallet (GCash, Maya, ...) are how customers pay; card values stay for older sales.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'E_WALLET';

ALTER TABLE "sales" ADD COLUMN "paymentProvider" TEXT,
ADD COLUMN "paymentReference" TEXT;

CREATE INDEX "sales_tenantId_paymentReference_idx" ON "sales"("tenantId", "paymentReference");
