-- AlterTable
ALTER TABLE "product_batches" ADD COLUMN     "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "product_batches_supplierId_idx" ON "product_batches"("supplierId");

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

