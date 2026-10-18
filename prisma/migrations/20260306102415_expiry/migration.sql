-- AlterTable
-- Some installations added this schema field with db push before a migration existed.
ALTER TABLE "Bounty" ADD COLUMN IF NOT EXISTS "settlementTxId" TEXT;
