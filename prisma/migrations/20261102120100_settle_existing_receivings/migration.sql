-- Payables start with this release: deliveries received before it are treated
-- as settled, since there was no way to record their payments until now.
UPDATE "receivings" SET "amountPaid" = "totalCost" WHERE "amountPaid" < "totalCost";
