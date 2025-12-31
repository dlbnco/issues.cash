import { Attempt, BountyStatus } from "@prisma/client";
import { Network } from "cashscript";
import {
  formatBCH,
  formatDate,
  getExplorerUrl,
  buildAttemptsTable,
} from "@/lib/format";

const CREDITS = `---
*Powered by [issues.cash](https://issues.cash) - Trustless bounties on Bitcoin Cash*`;

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
  amount: number | bigint;
  contributorLogin: string;
  contributorAddress: string;
  prNumber: number;
  txId: string;
  network: Network;
}

export function bountyCompletedMessage(params: BountyCompletedParams): string {
  const {
    issueNumber,
    amount,
    contributorLogin,
    contributorAddress,
    prNumber,
    txId,
    network,
  } = params;

  return `🎉 **Bounty Paid: ${formatBCH(amount)} BCH**

Congratulations @${contributorLogin}! Your solution has been merged and the bounty has been paid.

**Payment Details:**
- **Amount:** ${formatBCH(amount)} BCH
- **Recipient:** \`${contributorAddress}\`
- **Issue:** #${issueNumber}
- **PR:** #${prNumber}
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
}

export function bountyRefundedMessage(params: BountyRefundedParams): string {
  const { issueNumber, amount, maintainerAddress, txId, network } = params;

  return `🔄 **Bounty Refunded: ${formatBCH(amount)} BCH**

The bounty for issue #${issueNumber} has been refunded.

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
