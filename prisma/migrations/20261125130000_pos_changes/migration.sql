-- History of POS changes applied from the receipt designer, for Undo.

-- CreateTable
CREATE TABLE "pos_changes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,

    CONSTRAINT "pos_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_changes_tenantId_createdAt_idx" ON "pos_changes"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "pos_changes" ADD CONSTRAINT "pos_changes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
