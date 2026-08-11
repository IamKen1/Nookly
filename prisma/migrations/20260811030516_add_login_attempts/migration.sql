-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "accountKeyHash" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_accountKeyHash_createdAt_idx" ON "login_attempts"("accountKeyHash", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ip_createdAt_idx" ON "login_attempts"("ip", "createdAt");
