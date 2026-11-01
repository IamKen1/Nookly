-- AlterTable
ALTER TABLE "prescription_items" ADD COLUMN     "servedQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "held_carts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_carts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "held_carts_tenantId_storeId_createdAt_idx" ON "held_carts"("tenantId", "storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "held_carts" ADD CONSTRAINT "held_carts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_carts" ADD CONSTRAINT "held_carts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_carts" ADD CONSTRAINT "held_carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prescriptions already marked filled were fully dispensed.
UPDATE "prescription_items" pi SET "servedQuantity" = pi."quantity"
FROM "prescriptions" p WHERE pi."prescriptionId" = p."id" AND p."status" = 'FILLED';
