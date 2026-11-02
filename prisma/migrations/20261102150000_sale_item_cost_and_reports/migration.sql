
-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "unitCost" DECIMAL(10,2);


-- Reports were rebuilt as individual reports. Each plan keeps what it had,
-- under the new report keys: the old Overview covered sales, tax, profit,
-- inventory, purchasing and cash reports; the other tabs map one to one.
-- Plans can be adjusted afterwards in the ops console.
UPDATE "plans" p SET "enabledReports" = (
  SELECT COALESCE(jsonb_agg(DISTINCT k), '[]'::jsonb) FROM (
    SELECT unnest(CASE e
      WHEN 'overview' THEN ARRAY['sales-summary','sales-by-category','sales-by-cashier','sales-by-branch','sales-by-hour','payment-methods','voids-returns','vat-summary','discount-listing','profit-loss','reorder','slow-moving','stock-movement','transfers','purchases-by-supplier','purchase-log','payables-aging','supplier-returns','shift-summary','prescriptions']
      WHEN 'income' THEN ARRAY['sales-by-product']
      WHEN 'expenses' THEN ARRAY['expenses']
      WHEN 'e-services' THEN ARRAY['e-services']
      WHEN 'inventory-dates' THEN ARRAY['expiry']
      WHEN 'inventory-valuation' THEN ARRAY['inventory-valuation']
      ELSE ARRAY[e] END) AS k
    FROM jsonb_array_elements_text(p."enabledReports"::jsonb) AS e
  ) t
)
WHERE jsonb_typeof(p."enabledReports"::jsonb) = 'array'
  AND p."enabledReports"::jsonb ?| ARRAY['overview','income','inventory-dates'];
