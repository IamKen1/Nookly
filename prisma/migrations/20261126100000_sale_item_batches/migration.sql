-- Which lots each sold item was taken from, for receipts (lot / expiry per item).
ALTER TABLE "sale_items" ADD COLUMN "batches" JSONB;
