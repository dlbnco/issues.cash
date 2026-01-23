import { prisma } from "@/lib/prisma";
import type { BCHNetwork, BountyStatus } from "@prisma/client";

export interface BountyListItem {
  id: string;
  repoOwner: string;
  repoName: string;
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
  network?: BCHNetwork;
}): Promise<BountyListItem[]> {
  const { status, limit = 50, offset = 0, network } = options ?? {};

  const bounties = await prisma.bounty.findMany({
    where: {
      ...(status ? { status: { in: status } } : {}),
      ...(network ? { network } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
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
  repo: string,
  network?: BCHNetwork,
): Promise<BountyListItem[]> {
  const bounties = await prisma.bounty.findMany({
    where: {
      repoOwner: owner,
      repoName: repo,
      ...(network ? { network } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
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
export async function getProjectStats(
  owner: string,
  repo: string,
  network?: BCHNetwork,
) {
  const where = {
    repoOwner: owner,
    repoName: repo,
    ...(network ? { network } : {}),
  };

  const [bounties, totals] = await Promise.all([
    prisma.bounty.count({ where }),
    prisma.bounty.aggregate({
      where,
      _sum: { amount: true, fundedAmount: true },
    }),
  ]);

  const activeBounties = await prisma.bounty.count({
    where: { ...where, status: "ACTIVE" },
  });

  const claimedBounties = await prisma.bounty.count({
    where: { ...where, status: "CLAIMED" },
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
export async function getAttemptsByContributor(
  login: string,
  network?: BCHNetwork,
) {
  return await prisma.attempt.findMany({
    where: {
      contributorLogin: login,
      ...(network ? { bounty: { network } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      bounty: {
        select: {
          repoOwner: true,
          repoName: true,
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
export async function getActiveBountiesTotal(
  network?: BCHNetwork,
): Promise<bigint> {
  const result = await prisma.bounty.aggregate({
    where: {
      status: "ACTIVE",
      ...(network ? { network } : {}),
    },
    _sum: { fundedAmount: true },
  });

  return result._sum.fundedAmount ?? BigInt(0);
}

/**
 * Get top organizations by total funded amount
 */
export async function getTopOrganizations(
  limit: number = 10,
  network?: BCHNetwork,
) {
  const result = await prisma.bounty.groupBy({
    by: ["repoOwner"],
    where: network ? { network } : undefined,
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

  return result.map((org) => ({
    owner: org.repoOwner,
    totalFunded: org._sum.fundedAmount ?? BigInt(0),
    bountiesCount: org._count.id,
  }));
}

/**
 * Get all bounties for an organization (all repos)
 */
export async function getBountiesByOwner(
  owner: string,
  network?: BCHNetwork,
): Promise<BountyListItem[]> {
  const bounties = await prisma.bounty.findMany({
    where: {
      repoOwner: owner,
      ...(network ? { network } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
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
 * Get stats for an organization (all repos)
 */
export async function getOwnerStats(owner: string, network?: BCHNetwork) {
  const where = {
    repoOwner: owner,
    ...(network ? { network } : {}),
  };

  const [bounties, totals] = await Promise.all([
    prisma.bounty.count({ where }),
    prisma.bounty.aggregate({
      where,
      _sum: { amount: true, fundedAmount: true },
    }),
  ]);

  const activeBounties = await prisma.bounty.count({
    where: { ...where, status: "ACTIVE" },
  });

  const claimedBounties = await prisma.bounty.count({
    where: { ...where, status: "CLAIMED" },
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
 * Get repos with bounty counts for an organization
 */
export async function getReposByOwner(owner: string, network?: BCHNetwork) {
  const result = await prisma.bounty.groupBy({
    by: ["repoName"],
    where: {
      repoOwner: owner,
      ...(network ? { network } : {}),
    },
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
  });

  return result.map((repo) => ({
    name: repo.repoName,
    totalFunded: repo._sum.fundedAmount ?? BigInt(0),
    bountiesCount: repo._count.id,
  }));
}

/**
 * Get top contributors by claimed bounties
 */
export async function getTopContributors(
  limit: number = 10,
  network?: BCHNetwork,
) {
  const result = await prisma.attempt.groupBy({
    by: ["contributorLogin"],
    where: {
      status: "APPROVED",
      ...(network ? { bounty: { network } } : {}),
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
          ...(network ? { bounty: { network } } : {}),
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
        BigInt(0),
      );

      return {
        login: contributor.contributorLogin,
        claimedCount: contributor._count.id,
        totalEarned,
      };
    }),
  );

  return contributorsWithEarnings;
}

/**
 * Get global platform stats for homepage
 */
export async function getGlobalStats(network?: BCHNetwork) {
  const networkFilter = network ? { network } : {};

  const [
    activeBountiesTotal,
    pendingBountiesTotal,
    claimedBountiesTotal,
    totalClaims,
    totalContributors,
    totalOrganizations,
  ] = await Promise.all([
    // BCH in active bounties
    prisma.bounty.aggregate({
      where: { status: "ACTIVE", ...networkFilter },
      _sum: { fundedAmount: true },
    }),
    // BCH in pending bounties
    prisma.bounty.aggregate({
      where: { status: "PENDING_FUNDING", ...networkFilter },
      _sum: { amount: true },
    }),
    // Total BCH paid out (claimed bounties)
    prisma.bounty.aggregate({
      where: { status: "CLAIMED", ...networkFilter },
      _sum: { fundedAmount: true },
    }),
    // Total successful claims
    prisma.attempt.count({
      where: {
        status: "APPROVED",
        ...(network ? { bounty: { network } } : {}),
      },
    }),
    // Total unique contributors (with approved claims)
    prisma.attempt.groupBy({
      by: ["contributorLogin"],
      where: {
        status: "APPROVED",
        ...(network ? { bounty: { network } } : {}),
      },
    }),
    // Total unique organizations
    prisma.bounty.groupBy({
      by: ["repoOwner"],
      where: networkFilter,
    }),
  ]);

  return {
    activeBCH: activeBountiesTotal._sum.fundedAmount ?? BigInt(0),
    pendingBCH: pendingBountiesTotal._sum.amount ?? BigInt(0),
    paidBCH: claimedBountiesTotal._sum.fundedAmount ?? BigInt(0),
    totalClaims,
    totalContributors: totalContributors.length,
    totalOrganizations: totalOrganizations.length,
  };
}

/**
 * Get contributor stats
 */
export async function getContributorStats(login: string, network?: BCHNetwork) {
  const networkFilter = network ? { bounty: { network } } : {};

  const [totalAttempts, approvedAttempts, pendingAttempts] = await Promise.all([
    prisma.attempt.count({
      where: { contributorLogin: login, ...networkFilter },
    }),
    prisma.attempt.count({
      where: { contributorLogin: login, status: "APPROVED", ...networkFilter },
    }),
    prisma.attempt.count({
      where: { contributorLogin: login, status: "PENDING", ...networkFilter },
    }),
  ]);

  // Calculate total earned
  const approvedWithBounties = await prisma.attempt.findMany({
    where: { contributorLogin: login, status: "APPROVED", ...networkFilter },
    include: { bounty: { select: { amount: true, fundedAmount: true } } },
  });

  const totalEarned = approvedWithBounties.reduce(
    (sum, a) => sum + (a.bounty.fundedAmount ?? a.bounty.amount),
    BigInt(0),
  );

  return {
    totalAttempts,
    approvedAttempts,
    pendingAttempts,
    rejectedAttempts: totalAttempts - approvedAttempts - pendingAttempts,
    totalEarned,
  };
}
