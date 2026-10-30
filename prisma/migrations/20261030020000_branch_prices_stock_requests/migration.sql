-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "product_stocks" ADD COLUMN     "sellingPrice" DECIMAL(10,2),
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "transferReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_requests_tenantId_status_idx" ON "stock_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_requests_tenantId_requestNumber_key" ON "stock_requests"("tenantId", "requestNumber");

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

