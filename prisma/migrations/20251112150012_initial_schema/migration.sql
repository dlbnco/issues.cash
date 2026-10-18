-- CreateEnum
CREATE TYPE "BountyStatus" AS ENUM ('PENDING_FUNDING', 'ACTIVE', 'CLAIMED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Bounty" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fundedAt" TIMESTAMP(3),
    "issueUrl" TEXT NOT NULL,
    "issueHash" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "maintainerAddress" TEXT NOT NULL,
    "maintainerPKH" TEXT NOT NULL,
    "locktime" INTEGER NOT NULL,
    "oraclePubkey" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fundedAmount" BIGINT,
    "status" "BountyStatus" NOT NULL DEFAULT 'PENDING_FUNDING',

    CONSTRAINT "Bounty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bounty_issueUrl_key" ON "Bounty"("issueUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Bounty_issueHash_key" ON "Bounty"("issueHash");

-- CreateIndex
CREATE UNIQUE INDEX "Bounty_contractAddress_key" ON "Bounty"("contractAddress");

-- CreateIndex
CREATE INDEX "Bounty_status_idx" ON "Bounty"("status");

-- CreateIndex
CREATE INDEX "Bounty_issueUrl_idx" ON "Bounty"("issueUrl");

-- CreateIndex
CREATE INDEX "Bounty_contractAddress_idx" ON "Bounty"("contractAddress");
