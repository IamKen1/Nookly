-- AlterTable
ALTER TABLE "receipt_settings" ALTER COLUMN "receiptTitle" SET DEFAULT 'Acknowledgement Receipt (AR)';

-- Backfill: no tenant could have customized this (it wasn't exposed in the
-- settings UI until now), so it's safe to update every row still on the old
-- default — Nookly is not BIR-accredited and must not print "Official Receipt".
UPDATE "receipt_settings" SET "receiptTitle" = 'Acknowledgement Receipt (AR)' WHERE "receiptTitle" = 'Official Receipt';
