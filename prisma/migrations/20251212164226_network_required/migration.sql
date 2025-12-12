/*
  Warnings:

  - Made the column `network` on table `Bounty` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Bounty" ALTER COLUMN "network" SET NOT NULL;
