-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('GITHUB', 'GITLAB');

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "gitlabProjectId" TEXT,
ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'GITHUB';

-- CreateTable
CREATE TABLE "GitLabProject" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" INTEGER NOT NULL,
    "pathWithNamespace" TEXT NOT NULL,
    "instanceUrl" TEXT NOT NULL DEFAULT 'https://gitlab.com',
    "webhookSecret" TEXT NOT NULL,
    "accessToken" TEXT,

    CONSTRAINT "GitLabProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitLabProject_pathWithNamespace_idx" ON "GitLabProject"("pathWithNamespace");

-- CreateIndex
CREATE UNIQUE INDEX "GitLabProject_projectId_instanceUrl_key" ON "GitLabProject"("projectId", "instanceUrl");

-- CreateIndex
CREATE INDEX "Bounty_platform_idx" ON "Bounty"("platform");

-- AddForeignKey
ALTER TABLE "Bounty" ADD CONSTRAINT "Bounty_gitlabProjectId_fkey" FOREIGN KEY ("gitlabProjectId") REFERENCES "GitLabProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
