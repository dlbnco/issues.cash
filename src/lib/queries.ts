import { prisma } from "@/lib/prisma";
import type { BountyStatus } from "@prisma/client";

export interface BountyListItem {
  id: string;
  repoFullName: string;
  issueNumber: number;
  issueTitle: string | null;
  issueUrl: string;
  amount: bigint;
  fundedAmount: bigint | null;
  status: BountyStatus;
  createdAt: Date;
  attemptsCount: number;
}

/**
 * Get all bounties for the home page, ordered by most recent
 */
export async function getAllBounties(options?: {
  status?: BountyStatus[];
  limit?: number;
  offset?: number;
}): Promise<BountyListItem[]> {
  const { status, limit = 50, offset = 0 } = options ?? {};

  const bounties = await prisma.bounty.findMany({
    where: status ? { status: { in: status } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      repoFullName: true,
      issueNumber: true,
      issueTitle: true,
      issueUrl: true,
      amount: true,
      fundedAmount: true,
      status: true,
      createdAt: true,
      _count: {
        select: { attempts: true },
      },
    },
  });

  return bounties.map((b) => ({
    ...b,
    attemptsCount: b._count.attempts,
  }));
}

/**
 * Get bounties for a specific repository
 */
export async function getBountiesByRepo(
  owner: string,
  repo: string
): Promise<BountyListItem[]> {
  const repoFullName = `${owner}/${repo}`;

  const bounties = await prisma.bounty.findMany({
    where: { repoFullName },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      repoFullName: true,
      issueNumber: true,
      issueTitle: true,
      issueUrl: true,
      amount: true,
      fundedAmount: true,
      status: true,
      createdAt: true,
      _count: {
        select: { attempts: true },
      },
    },
  });

  return bounties.map((b) => ({
    ...b,
    attemptsCount: b._count.attempts,
  }));
}

/**
 * Get project stats for a repository
 */
export async function getProjectStats(owner: string, repo: string) {
  const repoFullName = `${owner}/${repo}`;

  const [bounties, totals] = await Promise.all([
    prisma.bounty.count({ where: { repoFullName } }),
    prisma.bounty.aggregate({
      where: { repoFullName },
      _sum: { amount: true, fundedAmount: true },
    }),
  ]);

  const activeBounties = await prisma.bounty.count({
    where: { repoFullName, status: "ACTIVE" },
  });

  const claimedBounties = await prisma.bounty.count({
    where: { repoFullName, status: "CLAIMED" },
  });

  return {
    totalBounties: bounties,
    activeBounties,
    claimedBounties,
    totalAmount: totals._sum.amount ?? BigInt(0),
    totalFunded: totals._sum.fundedAmount ?? BigInt(0),
  };
}

/**
 * Get attempts by contributor login
 */
export async function getAttemptsByContributor(login: string) {
  return await prisma.attempt.findMany({
    where: { contributorLogin: login },
    orderBy: { createdAt: "desc" },
    include: {
      bounty: {
        select: {
          repoFullName: true,
          issueNumber: true,
          issueTitle: true,
          issueUrl: true,
          amount: true,
          fundedAmount: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Get total amount of active bounties in satoshis
 */
export async function getActiveBountiesTotal(): Promise<bigint> {
  const result = await prisma.bounty.aggregate({
    where: { status: "ACTIVE" },
    _sum: { fundedAmount: true },
  });

  return result._sum.fundedAmount ?? BigInt(0);
}

/**
 * Get top organizations by total funded amount
 */
export async function getTopOrganizations(limit: number = 10) {
  const result = await prisma.bounty.groupBy({
    by: ["repoFullName"],
    _sum: {
      fundedAmount: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _sum: {
        fundedAmount: "desc",
      },
    },
    take: limit,
  });

  return result.map((org) => {
    const [owner, repo] = org.repoFullName.split("/");
    return {
      owner,
      repo,
      repoFullName: org.repoFullName,
      totalFunded: org._sum.fundedAmount ?? BigInt(0),
      bountiesCount: org._count.id,
    };
  });
}

/**
 * Get top contributors by claimed bounties
 */
export async function getTopContributors(limit: number = 10) {
  const result = await prisma.attempt.groupBy({
    by: ["contributorLogin"],
    where: {
      status: "APPROVED",
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: limit,
  });

  // Get total earned for each contributor
  const contributorsWithEarnings = await Promise.all(
    result.map(async (contributor) => {
      const approvedAttempts = await prisma.attempt.findMany({
        where: {
          contributorLogin: contributor.contributorLogin,
          status: "APPROVED",
        },
        include: {
          bounty: {
            select: { fundedAmount: true, amount: true },
          },
        },
      });

      const totalEarned = approvedAttempts.reduce(
        (sum, attempt) =>
          sum + (attempt.bounty.fundedAmount ?? attempt.bounty.amount),
        BigInt(0)
      );

      return {
        login: contributor.contributorLogin,
        claimedCount: contributor._count.id,
        totalEarned,
      };
    })
  );

  return contributorsWithEarnings;
}

/**
 * Get contributor stats
 */
export async function getContributorStats(login: string) {
  const [totalAttempts, approvedAttempts, pendingAttempts] = await Promise.all([
    prisma.attempt.count({ where: { contributorLogin: login } }),
    prisma.attempt.count({
      where: { contributorLogin: login, status: "APPROVED" },
    }),
    prisma.attempt.count({
      where: { contributorLogin: login, status: "PENDING" },
    }),
  ]);

  // Calculate total earned
  const approvedWithBounties = await prisma.attempt.findMany({
    where: { contributorLogin: login, status: "APPROVED" },
    include: { bounty: { select: { amount: true, fundedAmount: true } } },
  });

  const totalEarned = approvedWithBounties.reduce(
    (sum, a) => sum + (a.bounty.fundedAmount ?? a.bounty.amount),
    BigInt(0)
  );

  return {
    totalAttempts,
    approvedAttempts,
    pendingAttempts,
    rejectedAttempts: totalAttempts - approvedAttempts - pendingAttempts,
    totalEarned,
  };
}
