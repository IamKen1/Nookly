-- The VAT rate each sale was computed with (12 for every sale so far).
ALTER TABLE "sales" ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 12;

-- VAT the POS computes with (null rate = the standard 12%; Senior/PWD take VAT off first by law).
ALTER TABLE "pricing_settings" ADD COLUMN "vatRate" DECIMAL(5,2),
ADD COLUMN "seniorVatFirst" BOOLEAN NOT NULL DEFAULT true;
