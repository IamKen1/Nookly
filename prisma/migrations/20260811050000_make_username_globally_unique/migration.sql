-- DropIndex
DROP INDEX "users_tenantId_username_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
