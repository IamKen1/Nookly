-- CreateEnum
CREATE TYPE "LoyaltyTxnType" AS ENUM ('EARN', 'REDEEM', 'RETURN', 'VOID', 'ADJUST');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "featureLoyalty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "pointsAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pesosPerPoint" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "pesoValuePerPoint" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "LoyaltyTxnType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_settings_tenantId_key" ON "loyalty_settings"("tenantId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_customerId_createdAt_idx" ON "loyalty_transactions"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_saleId_idx" ON "loyalty_transactions"("saleId");

-- AddForeignKey
ALTER TABLE "loyalty_settings" ADD CONSTRAINT "loyalty_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

