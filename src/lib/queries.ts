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
