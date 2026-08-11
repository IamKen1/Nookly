-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cash_transactions_tenantId_storeId_createdAt_idx" ON "cash_transactions"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_transactions_shiftId_idx" ON "cash_transactions"("shiftId");

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

-- CreateIndex
CREATE INDEX "plan_change_requests_tenantId_status_idx" ON "plan_change_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_tenantId_storeId_saleDate_idx" ON "sales"("tenantId", "storeId", "saleDate");

-- CreateIndex
CREATE INDEX "sales_shiftId_idx" ON "sales"("shiftId");

-- CreateIndex
CREATE INDEX "shifts_tenantId_storeId_closedAt_idx" ON "shifts"("tenantId", "storeId", "closedAt");

-- CreateIndex
CREATE INDEX "shifts_userId_closedAt_idx" ON "shifts"("userId", "closedAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_storeId_createdAt_idx" ON "stock_movements"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_productId_idx" ON "stock_movements"("productId");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_idx" ON "support_tickets"("tenantId");
