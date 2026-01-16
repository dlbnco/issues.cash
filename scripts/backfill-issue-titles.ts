import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fetchIssueTitle(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "issues.cash-backfill",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to fetch ${owner}/${repo}#${issueNumber}: ${response.status}`
      );
      return null;
    }

    const data = await response.json();
    return data.title;
  } catch (error) {
    console.error(`Error fetching ${owner}/${repo}#${issueNumber}:`, error);
    return null;
  }
}

async function backfillIssueTitles() {
  // Get all bounties without issue titles
  const bounties = await prisma.bounty.findMany({
    where: {
      issueTitle: null,
    },
    select: {
      id: true,
      repoFullName: true,
      issueNumber: true,
    },
  });

  console.log(`Found ${bounties.length} bounties without issue titles`);

  for (const bounty of bounties) {
    const [owner, repo] = bounty.repoFullName.split("/");
    console.log(`Fetching title for ${owner}/${repo}#${bounty.issueNumber}...`);

    const title = await fetchIssueTitle(owner, repo, bounty.issueNumber);

    if (title) {
      await prisma.bounty.update({
        where: { id: bounty.id },
        data: { issueTitle: title },
      });
      console.log(`  Updated: "${title}"`);
    } else {
      console.log(`  Skipped (could not fetch)`);
    }

    // Rate limiting - wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("Done!");
}

backfillIssueTitles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
