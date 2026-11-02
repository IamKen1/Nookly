-- "Order taker" is no longer a role: any role can be allowed to send carts to
-- the cashier ("Send to cashier" in User Access). Existing order takers become
-- cashiers, and in their workspaces the Cashier role keeps the ability to send
-- orders so nothing they did stops working.
INSERT INTO "role_permissions" ("id", "tenantId", "role", "module", "allowed", "updatedAt")
SELECT gen_random_uuid()::text, t."tenantId", 'CASHIER', 'pos_send_to_cashier', true, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId" FROM "users" WHERE "role" = 'ORDER_TAKER') t
ON CONFLICT ("tenantId", "role", "module") DO UPDATE SET "allowed" = true, "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "users" SET "role" = 'CASHIER' WHERE "role" = 'ORDER_TAKER';

DELETE FROM "role_permissions" WHERE "role" = 'ORDER_TAKER';
