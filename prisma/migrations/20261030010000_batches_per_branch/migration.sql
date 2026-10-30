-- Batches now belong to a branch. Additive column first.
ALTER TABLE "product_batches" ADD COLUMN "storeId" TEXT;

-- Backfill: every existing batch belongs to its tenant's primary branch
-- (main branch first, else the earliest branch). Today every tenant has a
-- single branch, so this assigns each batch to the only branch it could be in.
UPDATE "product_batches" AS b
SET "storeId" = primary_store.id
FROM "products" AS p
JOIN LATERAL (
  SELECT s.id FROM "stores" AS s
  WHERE s."tenantId" = p."tenantId"
  ORDER BY s."isMainBranch" DESC, s."createdAt" ASC
  LIMIT 1
) AS primary_store ON TRUE
WHERE b."productId" = p.id AND b."storeId" IS NULL;

-- The same batch number can now exist at two branches (after a transfer), so
-- uniqueness becomes per branch. The new rule is looser than the old one, so
-- all existing rows already satisfy it.
DROP INDEX "product_batches_productId_batchNumber_key";
CREATE UNIQUE INDEX "product_batches_productId_storeId_batchNumber_key" ON "product_batches"("productId", "storeId", "batchNumber");
CREATE INDEX "product_batches_storeId_idx" ON "product_batches"("storeId");

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
