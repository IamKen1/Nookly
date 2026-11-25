-- On sales adjusted by the owner's pricing rules: the standard computation's
-- figures before the adjustment, for the receipt's step-by-step lines.
ALTER TABLE "sales" ADD COLUMN "computedParts" JSONB;
