ALTER TABLE "WebBounty" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "SettlementAttempt" ADD COLUMN "rawTx" TEXT;

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
