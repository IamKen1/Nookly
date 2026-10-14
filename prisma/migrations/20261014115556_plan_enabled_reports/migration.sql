ALTER TABLE "plans" ADD COLUMN "enabledReports" JSONB NOT NULL DEFAULT '[]';

UPDATE "plans"
SET "enabledReports" = '["overview","income","expenses","e-services","inventory-dates","inventory-valuation"]'::jsonb
WHERE "featureReports" = true;

ALTER TABLE "plans" DROP COLUMN "featureReports";
