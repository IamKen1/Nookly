-- The discount chosen when an order is sent to the cashier (optional).
ALTER TABLE "pending_orders" ADD COLUMN "discount" JSONB;
