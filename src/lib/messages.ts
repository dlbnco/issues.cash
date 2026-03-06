import { Attempt, BountyStatus, Platform } from "@prisma/client";
import { Network } from "cashscript";
import {
  formatBCH,
  formatDate,
  getExplorerUrl,
  buildAttemptsTable,
} from "@/lib/format";

const CREDITS = `---
*Powered by [issues.cash](https://issues.cash)*`;

export function errorRefundPendingAttemptsFound(attempts: Attempt[]): string {
  return `❌ **Error refunding bounty**

There are pending attempts for this bounty. Close all pull requests first, then re-open and close the issue again:
${buildAttemptsTable(attempts)}
`;
}

export function invalidCommandError(error: string): string {
  return `❌ **Invalid bounty command**

${error}

**Usage:** \`/bounty <amount> --refund <address>\`
**Example:** \`/bounty 2.35 --refund bitcoincash:qp...\``;
}

export function networkMismatchError(
  network: string,
  expectedPrefix: string,
  error: string,
): string {
  return `❌ **Address Network Mismatch**

${error}

This repository is configured for **${network}**. Addresses must start with \`${expectedPrefix}\`.

**Examples:**
- Mainnet: \`bitcoincash:qp3wjpa3tjlj042z2wv7hahzkkprgllgnsyynhyaka\`
- Testnet: \`bchtest:qp3wjpa3tjlj042z2wv7hahzkkprgllgnsn45dme9u\``;
}

export function unauthorizedError(authorAssociation: string): string {
  return `❌ **Unauthorized**

Only repository maintainers can create bounties.

Your association: ${authorAssociation}`;
}

export function bountyExistsError(
  contractAddress: string,
  status: BountyStatus,
  amount: number | bigint,
): string {
  let nextSteps = "";

  switch (status) {
    case BountyStatus.PENDING_FUNDING:
      nextSteps =
        "You can modify a pending bounty by first deleting it , then creating a new one. To delete it, simply delete its issue comment.";
      break;
    case BountyStatus.ACTIVE:
      nextSteps =
        "To modify an active bounty, close the issue first to receive the refund, then re-open the issue and create a new bounty.";
      break;
    case BountyStatus.CLAIMED:
      nextSteps = "A bounty has already been claimed for this issue.";
      break;
  }

  return `❌ **Bounty already exists**

A bounty already exists for this issue.

${nextSteps}

**Contract Address:** \`${contractAddress}\`
**Status:** ${status}
**Amount:** ${formatBCH(amount)} BCH`;
}

export function issueClosedError(): string {
  return `❌ **Failed to Create Bounty**

  Bounties cannot be created for closed issues.`;
}

export function bountyCreationError(errorMessage: string): string {
  return `❌ **Failed to Create Bounty**

${errorMessage}

Please try again or contact support.`;
}

export function invalidClaimCommandError(error: string): string {
  return `❌ **Invalid /claim command**

${error}

**Usage:** \`/claim <issue_number> --address <address>\`
**Example:** \`/claim 123 --address bitcoincash:qp...\``;
}

export function noBountyFoundError(issueNumber: number): string {
  return `❌ **No Bounty Found**

There is no active bounty for issue #${issueNumber} in this repository.`;
}

export function bountyNotActiveError(
  issueNumber: number,
  status: BountyStatus,
  contractAddress: string,
): string {
  const pendingNote =
    status === "PENDING_FUNDING" ? "\n\n⏳ Waiting for funding..." : "";

  return `❌ **Bounty Not Active**

The bounty for issue #${issueNumber} is not active yet.

**Status:** ${status}
**Contract Address:** \`${contractAddress}\`${pendingNote}`;
}

export function claimRegistrationError(errorMessage: string): string {
  return `❌ **Failed to Register Claim**

${errorMessage}

Please try again or contact support.`;
}

export interface BountyCreatedParams {
  amount: number | bigint;
  feeAmount: number | bigint;
  contractAddress: string;
  refundAddress: string;
  expiryDate: number | Date;
  status: BountyStatus;
}

export function bountyCreatedMessage(params: BountyCreatedParams): string {
  const {
    amount,
    feeAmount,
    contractAddress,
    refundAddress,
    expiryDate,
    status,
  } = params;

  const totalRequired = Number(amount) + Number(feeAmount);

  return `# 🧩 Bounty Created: ${formatBCH(amount)} BCH

**Send exactly**
\`\`\`
${formatBCH(totalRequired)}
\`\`\`
**to the address below to activate the bounty:**
\`\`\`
${contractAddress}
\`\`\`

⚠️ **Important:** Fund the bounty in a **single transaction**. Multiple transactions will increase the network fee when the bounty is paid out or refunded.

⚠️ Anyone can deposit to the contract, but refunds can only be sent to the specified refund address.

## Bounty details
- **Amount:** ${formatBCH(amount)} BCH (${Number(amount).toLocaleString()} satoshis)
- **Network fee:** ${formatBCH(feeAmount)} BCH (${Number(feeAmount).toLocaleString()} satoshis)
- **Total to deposit:** ${formatBCH(totalRequired)} BCH (${totalRequired.toLocaleString()} satoshis)
- **Refund address:** \`${refundAddress}\`
- **Expires:** ${formatDate(expiryDate)}
- **Status:** ${status}

${CREDITS}`;
}

export interface BountyFundedParams {
  amount: number | bigint;
  fundedAmount?: number | bigint | null;
  contractAddress: string;
  expiryDate: number | Date;
  issueNumber: number;
  attempts?: Attempt[];
}

export function bountyFundedMessage(params: BountyFundedParams): string {
  const {
    amount,
    fundedAmount,
    contractAddress,
    expiryDate,
    issueNumber,
    attempts,
  } = params;

  const attemptsList = buildAttemptsTable(attempts ?? []);

  return `# 🧩 Bounty funded: ${formatBCH(fundedAmount ?? amount)} BCH

This bounty is now **active** and ready to be claimed!

## Bounty Details
- **Amount:** ${formatBCH(amount)} BCH (${Number(amount).toLocaleString()} satoshis)
- **Funded amount:** ${formatBCH(fundedAmount ?? amount)} BCH (${Number(fundedAmount ?? amount).toLocaleString()} satoshis)
- **Contract:** \`${contractAddress}\`
- **Expires:** ${formatDate(expiryDate)}

${
  (attempts?.length ?? 0 > 0)
    ? `
---
## Attempts

${attemptsList}
`
    : ""
}

## How to claim

Submit a PR that solves this issue, and add the command below to your PR description:
\`\`\`
/claim ${issueNumber} --address <your_address>
\`\`\`

When your PR is merged, the bounty will be automatically paid to your address.

If the issue is closed before a solution is merged, or the expiry date is reached, funds are refunded.

${CREDITS}`;
}

export interface ClaimRegisteredParams {
  issueNumber: number;
  amount: number | bigint;
  contributorAddress: string;
  contractAddress: string;
}

export function claimRegisteredMessage(params: ClaimRegisteredParams): string {
  const { issueNumber, amount, contributorAddress, contractAddress } = params;

  return `✅ **Claim Registered**

Your attempt to solve issue #${issueNumber} has been registered!

**Bounty Details:**
- **Amount:** ${formatBCH(amount)} BCH
- **Your Address:** \`${contributorAddress}\`
- **Issue:** #${issueNumber}
- **Contract:** \`${contractAddress}\`

**Next Steps:**
1. Complete the work to solve the issue
2. When your PR is merged, the bounty will be automatically paid to your address
3. The oracle will verify the merge and authorize the payment

**Note:** If you need to update your payment address, edit this PR description and change the \`/claim\` command.

${CREDITS}`;
}

export interface ClaimRejectedParams {
  issueNumber: number;
}

export function claimRejectedMessage(params: ClaimRejectedParams): string {
  return `❌ **Claim rejected**

Your attempt to solve issue #${params.issueNumber} has been rejected.

${CREDITS}`;
}

export interface BountyAttempt {
  prNumber: number;
  contributorLogin: string;
  contributorAddress: string;
}

export interface BountyUpdateParams {
  attemptsCount: number;
  attempts: BountyAttempt[];
  amount: number | bigint;
}

export function bountyUpdateMessage(params: BountyUpdateParams): string {
  const { attemptsCount, attempts, amount } = params;

  const attemptsList = attempts
    .map(
      (a) =>
        `- PR #${a.prNumber} by @${a.contributorLogin} - \`${a.contributorAddress}\``,
    )
    .join("\n");

  return `🎯 **Bounty Update**

A new attempt has been registered for this bounty!

**Active Attempts (${attemptsCount}):**
${attemptsList}

**Bounty Amount:** ${formatBCH(amount)} BCH

${CREDITS}`;
}

export interface BountyCompletedParams {
  issueNumber: number;
  /** Original bounty amount from command */
  amount: number | bigint;
  /** Actual funded amount (may be higher than amount) */
  fundedAmount?: number | bigint;
  /** Amount the contributor receives after commission */
  contributorAmount: number | bigint;
  /** Commission amount in satoshis */
  commissionAmount: number | bigint;
  /** Commission rate in basis points */
  commissionBps: number;
  /** Whether this is a founding partner project */
  isZeroCommissionProject: boolean;
  contributorLogin: string;
  contributorAddress: string;
  prNumber: number;
  txId: string;
  network: Network;
  /** Platform for correct PR/MR link format */
  platform: Platform;
}

function formatCommissionBreakdown(params: {
  amount: number | bigint;
  fundedAmount?: number | bigint;
  contributorAmount: number | bigint;
  commissionAmount: number | bigint;
  commissionBps: number;
  isZeroCommissionProject: boolean;
}): string {
  const {
    amount,
    fundedAmount,
    contributorAmount,
    commissionAmount,
    commissionBps,
    isZeroCommissionProject,
  } = params;

  const commissionAmountNum = Number(commissionAmount);
  const amountNum = BigInt(amount);
  const fundedNum = fundedAmount ? BigInt(fundedAmount) : amountNum;
  const bonusAmount = fundedNum > amountNum ? fundedNum - amountNum : BigInt(0);

  // No commission (globally disabled)
  if (commissionBps === 0 && !isZeroCommissionProject) {
    let result = `- **Bounty amount:** ${formatBCH(amount)} BCH`;
    if (bonusAmount > 0) {
      result += `\n- **Bonus:** ${formatBCH(bonusAmount)} BCH`;
    }
    return result;
  }

  // Zero commission (founding partner)
  if (isZeroCommissionProject) {
    let result = `- **Bounty amount:** ${formatBCH(amount)} BCH`;
    if (bonusAmount > 0) {
      result += `\n- **Bonus:** ${formatBCH(bonusAmount)} BCH`;
    }
    result += `\n- **Commission:** 0 BCH (Founding Partner)`;
    return result;
  }

  // With commission
  const commissionPercent = (commissionBps / 100).toFixed(
    commissionBps % 100 === 0 ? 0 : 1,
  );
  let result = `- **Bounty amount:** ${formatBCH(amount)} BCH`;
  if (bonusAmount > 0) {
    result += `\n- **Bonus:** ${formatBCH(bonusAmount)} BCH`;
  }
  result += `\n- **Commission:** ${formatBCH(commissionAmountNum)} BCH (${commissionPercent}%)`;
  result += `\n- **You receive:** ${formatBCH(contributorAmount)} BCH`;
  return result;
}

export function bountyCompletedMessage(params: BountyCompletedParams): string {
  const {
    issueNumber,
    amount,
    fundedAmount,
    contributorAmount,
    commissionAmount,
    commissionBps,
    isZeroCommissionProject,
    contributorLogin,
    contributorAddress,
    prNumber,
    txId,
    network,
    platform,
  } = params;

  const commissionBreakdown = formatCommissionBreakdown({
    amount,
    fundedAmount,
    contributorAmount,
    commissionAmount,
    commissionBps,
    isZeroCommissionProject,
  });

  // GitLab uses "MR" with ! prefix, GitHub uses "PR" with # prefix
  const prLabel = platform === Platform.GITLAB ? "MR" : "PR";
  const prPrefix = platform === Platform.GITLAB ? "!" : "#";

  return `🎉 **Bounty Paid!**

Congratulations @${contributorLogin}! Your solution has been merged and the bounty has been paid.

**Payment Details:**
${commissionBreakdown}
- **Recipient:** \`${contributorAddress}\`
- **Issue:** #${issueNumber}
- **${prLabel}:** ${prPrefix}${prNumber}
- **Transaction:** \`${txId}\`

View transaction: ${getExplorerUrl(txId, network)}

${CREDITS}`;
}

export interface BountyRefundedParams {
  issueNumber: number;
  amount: number | bigint;
  maintainerAddress: string;
  txId: string;
  network: Network;
  reason?: "closed" | "expired";
}

export function bountyRefundedMessage(params: BountyRefundedParams): string {
  const { issueNumber, amount, maintainerAddress, txId, network, reason } =
    params;

  const reasonText =
    reason === "expired"
      ? `The bounty for issue #${issueNumber} has expired (locktime reached) and has been automatically refunded to the maintainer.`
      : `The bounty for issue #${issueNumber} has been refunded.`;

  return `🔄 **Bounty Refunded: ${formatBCH(amount)} BCH**

${reasonText}

**Refund Details:**
- **Amount:** ${formatBCH(amount)} BCH
- **Recipient:** \`${maintainerAddress}\`
- **Transaction:** \`${txId}\`

View transaction: ${getExplorerUrl(txId, network)}

${CREDITS}`;
}

export interface BountyExpiredParams {
  issueNumber: number;
  amount: number | bigint;
  contractAddress: string;
  expiryDate: number | Date;
}

export function bountyExpiredMessage(params: BountyExpiredParams): string {
  const { issueNumber, amount, contractAddress, expiryDate } = params;

  return `⏰ **Bounty Expired**

The bounty for issue #${issueNumber} has expired and can now be reclaimed.

**Bounty Details:**
- **Amount:** ${formatBCH(amount)} BCH
- **Contract:** \`${contractAddress}\`
- **Expired:** ${formatDate(expiryDate)}

The maintainer can now reclaim the funds using the \`timeout()\` function.

${CREDITS}`;
}

export function bountyCancelledMessage(username: string): string {
  return `**Bounty cancelled** by @${username}

${CREDITS}`;
}

export function noPendingBountyError(): string {
  return `**No pending bounty to cancel**

There is no pending (unfunded) bounty for this issue.`;
}

export function bountyAlreadyFundedError(): string {
  return `**Cannot cancel: bounty is already funded**

This bounty has already been funded and is now active. To get a refund, close the issue instead.`;
}
