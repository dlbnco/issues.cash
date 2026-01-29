import { Platform } from "@prisma/client";
import { DUST_LIMIT } from "./constants";

/**
 * Commission configuration
 *
 * COMMISSION_BPS: Global commission rate in basis points (100 = 1%)
 * Default: 0 (no commission until explicitly set)
 *
 * ZERO_COMMISSION_PROJECTS: Comma-separated list of projects that pay 0% commission
 * Format: "github:owner/repo,gitlab:owner/repo"
 * These are "founding partner" projects.
 */

/**
 * Get the global commission rate in basis points from env
 * @returns Commission rate in basis points (0-10000)
 */
export function getGlobalCommissionBps(): number {
  const envValue = process.env.COMMISSION_BPS;
  if (!envValue) return 0;

  const bps = parseInt(envValue, 10);
  if (isNaN(bps) || bps < 0 || bps > 10000) {
    console.warn(
      `Invalid COMMISSION_BPS value: ${envValue}. Must be 0-10000. Using 0.`
    );
    return 0;
  }
  return bps;
}

/**
 * Check if a project is in the zero-commission list (founding partners)
 */
export function isZeroCommissionProject(
  platform: Platform,
  repoOwner: string,
  repoName: string
): boolean {
  const envValue = process.env.ZERO_COMMISSION_PROJECTS;
  if (!envValue) return false;

  const platformPrefix = platform === Platform.GITHUB ? "github" : "gitlab";
  const projectKey = `${platformPrefix}:${repoOwner}/${repoName}`.toLowerCase();

  const zeroCommissionProjects = envValue
    .split(",")
    .map((p) => p.trim().toLowerCase());

  return zeroCommissionProjects.includes(projectKey);
}

export interface CommissionResult {
  /** Commission amount in satoshis */
  commissionAmount: bigint;
  /** Commission rate in basis points (0-10000) */
  commissionBps: number;
  /** Amount contributor receives after commission and tx fee */
  contributorAmount: bigint;
  /** Whether this project is in the zero-commission list */
  isZeroCommissionProject: boolean;
}

/**
 * Calculate commission for a bounty completion
 *
 * @param fundedAmount - Total funded amount in satoshis
 * @param txFee - Transaction fee in satoshis
 * @param platform - Platform (GITHUB or GITLAB)
 * @param repoOwner - Repository owner
 * @param repoName - Repository name
 * @returns Commission calculation result
 */
export function calculateCommission(
  fundedAmount: bigint,
  txFee: bigint,
  platform: Platform,
  repoOwner: string,
  repoName: string
): CommissionResult {
  const globalBps = getGlobalCommissionBps();

  // If global commission is 0, skip all commission logic
  if (globalBps === 0) {
    return {
      commissionAmount: BigInt(0),
      commissionBps: 0,
      contributorAmount: fundedAmount - txFee,
      isZeroCommissionProject: false,
    };
  }

  // Check if this is a zero-commission project
  const isZeroProject = isZeroCommissionProject(platform, repoOwner, repoName);

  if (isZeroProject) {
    return {
      commissionAmount: BigInt(0),
      commissionBps: 0,
      contributorAmount: fundedAmount - txFee,
      isZeroCommissionProject: true,
    };
  }

  // Calculate commission: (fundedAmount - txFee) * bps / 10000
  const netAmount = fundedAmount - txFee;
  let commissionAmount = (netAmount * BigInt(globalBps)) / BigInt(10000);

  // If commission is below dust limit, give it to contributor instead
  // (can't create an output below dust limit)
  if (commissionAmount < DUST_LIMIT) {
    commissionAmount = BigInt(0);
  }

  const contributorAmount = netAmount - commissionAmount;

  return {
    commissionAmount,
    commissionBps: commissionAmount > 0 ? globalBps : 0,
    contributorAmount,
    isZeroCommissionProject: false,
  };
}
