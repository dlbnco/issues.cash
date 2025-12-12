/*
  Warnings:

  - A unique constraint covering the columns `[prUrl]` on the table `Attempt` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Attempt_prUrl_key" ON "Attempt"("prUrl");
