-- When the owner's price formula applies: payment method and a total range.
ALTER TABLE "pricing_settings" ADD COLUMN "rulePayment" TEXT NOT NULL DEFAULT 'any',
ADD COLUMN "ruleMinTotal" DECIMAL(12,2),
ADD COLUMN "ruleMaxTotal" DECIMAL(12,2);
