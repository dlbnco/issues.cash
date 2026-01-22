-- Split repoFullName into repoOwner and repoName

-- Add new columns (nullable initially)
ALTER TABLE "Bounty" ADD COLUMN "repoOwner" TEXT;
ALTER TABLE "Bounty" ADD COLUMN "repoName" TEXT;

-- Populate from existing data
UPDATE "Bounty" SET 
  "repoOwner" = split_part("repoFullName", '/', 1),
  "repoName" = split_part("repoFullName", '/', 2);

-- Make columns required
ALTER TABLE "Bounty" ALTER COLUMN "repoOwner" SET NOT NULL;
ALTER TABLE "Bounty" ALTER COLUMN "repoName" SET NOT NULL;

-- Drop old index
DROP INDEX IF EXISTS "Bounty_issueNumber_repoFullName_idx";

-- Drop old column
ALTER TABLE "Bounty" DROP COLUMN "repoFullName";

-- Create new indexes
CREATE INDEX "Bounty_issueNumber_repoOwner_repoName_idx" ON "Bounty"("issueNumber", "repoOwner", "repoName");
CREATE INDEX "Bounty_repoOwner_idx" ON "Bounty"("repoOwner");
