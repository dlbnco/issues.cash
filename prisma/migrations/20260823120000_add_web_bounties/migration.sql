-- AlterEnum
ALTER TYPE "Platform" ADD VALUE 'WEB';

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "SettlementIntent" AS ENUM ('PAYOUT', 'REFUND', 'TIMEOUT');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'BROADCAST', 'CONFIRMED', 'FAILED');

-- AlterEnum
ALTER TYPE "BountyStatus" ADD VALUE 'SETTLING';

-- AlterTable
ALTER TABLE "Bounty" ALTER COLUMN "issueUrl" DROP NOT NULL,
ALTER COLUMN "issueNumber" DROP NOT NULL,
ALTER COLUMN "repoOwner" DROP NOT NULL,
ALTER COLUMN "repoName" DROP NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "photoUrl" TEXT,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebBounty" (
    "bountyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "creatorId" TEXT NOT NULL,
    CONSTRAINT "WebBounty_pkey" PRIMARY KEY ("bountyId")
);

CREATE TABLE "BountyRevision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bountyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    CONSTRAINT "BountyRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bountyId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "settlementTxId" TEXT,
    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClaimRevision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "payoutAddress" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "workUrl" TEXT,
    CONSTRAINT "ClaimRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "intent" "SettlementIntent" NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "txId" TEXT,
    "error" TEXT,
    "bountyId" TEXT NOT NULL,
    "claimId" TEXT,
    CONSTRAINT "SettlementAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "WebBounty_slug_key" ON "WebBounty"("slug");
CREATE INDEX "WebBounty_creatorId_idx" ON "WebBounty"("creatorId");
CREATE UNIQUE INDEX "BountyRevision_bountyId_revision_key" ON "BountyRevision"("bountyId", "revision");
CREATE INDEX "BountyRevision_bountyId_createdAt_idx" ON "BountyRevision"("bountyId", "createdAt");
CREATE UNIQUE INDEX "Claim_bountyId_claimantId_key" ON "Claim"("bountyId", "claimantId");
CREATE INDEX "Claim_bountyId_status_idx" ON "Claim"("bountyId", "status");
CREATE INDEX "Claim_claimantId_idx" ON "Claim"("claimantId");
CREATE UNIQUE INDEX "ClaimRevision_claimId_revision_key" ON "ClaimRevision"("claimId", "revision");
CREATE INDEX "ClaimRevision_claimId_createdAt_idx" ON "ClaimRevision"("claimId", "createdAt");
CREATE UNIQUE INDEX "SettlementAttempt_idempotencyKey_key" ON "SettlementAttempt"("idempotencyKey");
CREATE INDEX "SettlementAttempt_bountyId_status_idx" ON "SettlementAttempt"("bountyId", "status");
CREATE INDEX "SettlementAttempt_claimId_idx" ON "SettlementAttempt"("claimId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebBounty" ADD CONSTRAINT "WebBounty_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebBounty" ADD CONSTRAINT "WebBounty_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BountyRevision" ADD CONSTRAINT "BountyRevision_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "WebBounty"("bountyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimRevision" ADD CONSTRAINT "ClaimRevision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementAttempt" ADD CONSTRAINT "SettlementAttempt_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementAttempt" ADD CONSTRAINT "SettlementAttempt_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
