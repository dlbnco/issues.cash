/*
  Warnings:

  - Added the required column `issueNumber` to the `Bounty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repoFullName` to the `Bounty` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "feeAmount" BIGINT,
ADD COLUMN     "issueNumber" INTEGER NOT NULL,
ADD COLUMN     "repoFullName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prUrl" TEXT NOT NULL,
    "contributorLogin" TEXT NOT NULL,
    "contributorAddress" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING',
    "bountyId" TEXT NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attempt_bountyId_idx" ON "Attempt"("bountyId");

-- CreateIndex
CREATE INDEX "Attempt_contributorAddress_idx" ON "Attempt"("contributorAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_bountyId_prNumber_key" ON "Attempt"("bountyId", "prNumber");

-- CreateIndex
CREATE INDEX "Bounty_issueNumber_repoFullName_idx" ON "Bounty"("issueNumber", "repoFullName");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
