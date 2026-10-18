-- CreateEnum
CREATE TYPE "Network" AS ENUM ('TESTNET3', 'MAINNET');

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "network" "Network";
