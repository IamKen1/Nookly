-- CreateTable
CREATE TABLE "shift_expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_expenses_shiftId_idx" ON "shift_expenses"("shiftId");

-- AddForeignKey
ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
