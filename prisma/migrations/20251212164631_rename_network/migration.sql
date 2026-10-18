/*
  Warnings:

  - The `network` column on the `Bounty` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "BCHNetwork" AS ENUM ('TESTNET3', 'MAINNET');

-- AlterTable
ALTER TABLE "Bounty" DROP COLUMN "network",
ADD COLUMN     "network" "BCHNetwork";

-- DropEnum
DROP TYPE "public"."Network";
