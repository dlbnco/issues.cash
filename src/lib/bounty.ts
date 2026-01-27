import { prisma } from "@/lib/prisma";
import {
  createConfig,
  createBounty,
  checkBountyFunding,
  rebuildBountyContract,
  completeBounty,
  refundBounty,
  timeoutBounty,
  getOracleFeePKH,
  type TransactionResult,
} from "@/lib/contract";
import { bchToSats } from "@/lib/commands";
import type { Bounty } from "@prisma/client";
import type { Network } from "cashscript";
import {
  postIssueComment,
  updateIssueComment,
  getRepoBchNetwork,
} from "./github/api";
import {
  postIssueNote,
  updateIssueNote,
  postMergeRequestNote,
  updateMergeRequestNote,
} from "./gitlab/api";
import {
  bountyCompletedMessage,
  bountyFundedMessage,
  claimRegisteredMessage,
  claimRejectedMessage,
} from "./messages";
import { AttemptStatus, BCHNetwork, BountyStatus, Platform } from "@prisma/client";
import { UNLOCKING_TX_FEE_AMOUNT } from "./constants";
import { calculateCommission, type CommissionResult } from "./commission";
import {
  fromElectrumToPrismaNetwork,
  fromPrismaToElectrumNetwork,
} from "./network";

export interface CreateBountyParams {
  issueUrl: string;
  issueNumber: number;
  issueTitle: string;
  repoOwner: string;
  repoName: string;
  amountBCH: number;
  refundAddress: string;
  expiryDays?: number;
  network?: Network;
  // GitHub-specific
  installationId?: number;
  // GitLab-specific
  platform?: Platform;
  gitlabProjectId?: string;
}

export interface BountyInfo {
  id: string;
  issueUrl: string;
  issueHash: string;
  contractAddress: string;
  maintainerAddress: string;
  amount: number; // satoshis (bounty amount only, excluding fee)
  feeAmount: number; // satoshis
  locktime: number;
  expiryDate: string;
  status: BountyStatus;
}

/**
 * Create a new bounty from a command
 */
export async function createBountyFromCommand(
  params: CreateBountyParams,
): Promise<BountyInfo> {
  const {
    issueUrl,
    issueNumber,
    issueTitle,
    repoOwner,
    repoName,
    amountBCH,
    refundAddress,
    expiryDays = 90,
    network,
    installationId,
    platform = "GITHUB",
    gitlabProjectId,
  } = params;

  // Validate network
  if (network !== "mainnet" && network !== "testnet3") {
    throw new Error(
      `Invalid network: ${network}. Must be "mainnet" or "testnet3"`,
    );
  }

  // Create contract configuration
  const config = createConfig(
    network as Network,
    "./contracts/DynamicBounty.cash",
    `./oracle-key-${network}.json`,
  );

  // Create the bounty contract
  const bountyContract = createBounty(
    config,
    issueUrl,
    refundAddress,
    expiryDays,
  );

  // Convert BCH to satoshis (this is the bounty amount the contributor will receive)
  const bountyAmountSatoshis = BigInt(bchToSats(amountBCH));

  // Since each use may result in a different
  // transaction size, instead of trying to estimate the fee,
  // we will just use a hardcoded fee with a slight margin.
  const feeAmount = UNLOCKING_TX_FEE_AMOUNT;

  // Store in database - amount is bounty only, fee is separate
  const bounty = await prisma.bounty.create({
    data: {
      issueUrl,
      issueNumber,
      issueTitle,
      repoOwner,
      repoName,
      issueHash: bountyContract.issueHash,
      contractAddress: bountyContract.address,
      maintainerAddress: bountyContract.maintainerAddress,
      maintainerPKH: bountyContract.maintainerPKH,
      locktime: bountyContract.locktime,
      oraclePubkey: bountyContract.oraclePubkey,
      amount: bountyAmountSatoshis,
      feeAmount: feeAmount,
      status: "PENDING_FUNDING",
      installationId,
      network: fromElectrumToPrismaNetwork(network),
      platform,
      gitlabProjectId,
    },
  });

  // Total amount to fund contract = bounty amount + fee
  const totalRequired = bountyAmountSatoshis + feeAmount;

  console.log(`✅ Bounty created for ${issueUrl}`);
  console.log(`   Contract: ${bountyContract.address}`);
  console.log(
    `   Bounty amount: ${amountBCH} BCH (${bountyAmountSatoshis} sats)`,
  );
  console.log(`   Transaction fee: ${feeAmount} sats`);
  console.log(`   Total required: ${totalRequired} sats`);

  return {
    id: bounty.id,
    issueUrl: bounty.issueUrl,
    issueHash: bounty.issueHash,
    contractAddress: bounty.contractAddress,
    maintainerAddress: bounty.maintainerAddress,
    amount: Number(bounty.amount),
    feeAmount: Number(bounty.feeAmount),
    locktime: bounty.locktime,
    expiryDate: new Date(bounty.locktime * 1000).toISOString(),
    status: bounty.status,
  };
}

export async function updateBountyCommentId(
  bountyId: string,
  commentId: number | bigint,
): Promise<void> {
  await prisma.bounty.update({
    where: { id: bountyId },
    data: { commentId },
  });
}

/**
 * Check and update funding status for pending bounties
 * This should be run as a cron job
 */
export async function checkPendingBounties(): Promise<{
  checked: number;
  funded: number;
}> {
  const config = {
    [BCHNetwork.MAINNET]: createConfig(
      "mainnet",
      "./contracts/DynamicBounty.cash",
      `./oracle-key-mainnet.json`,
    ),
    [BCHNetwork.TESTNET3]: createConfig(
      "testnet3",
      "./contracts/DynamicBounty.cash",
      `./oracle-key-testnet3.json`,
    ),
  };

  // Get all pending bounties
  const pending = await prisma.bounty.findMany({
    where: { status: "PENDING_FUNDING" },
  });

  let fundedCount = 0;

  for (const bounty of pending) {
    try {
      const balance = await checkBountyFunding(
        config[bounty.network],
        bounty.contractAddress,
      );

      // Total required = bounty amount + fee
      const totalRequired = bounty.amount + (bounty.feeAmount ?? BigInt(0));
      const isFunded = balance.confirmed >= totalRequired;

      if (isFunded) {
        console.log(`✅ Bounty funded: ${bounty.issueUrl}`);
        console.log(`   Bounty amount: ${bounty.amount} sats`);
        console.log(`   Fee: ${bounty.feeAmount} sats`);
        console.log(`   Total required: ${totalRequired} sats`);
        console.log(`   Received: ${balance.confirmed} sats`);

        await prisma.bounty.update({
          where: { id: bounty.id },
          data: {
            status: "ACTIVE",
            fundedAt: new Date(),
            fundedAmount: Number(balance.confirmed),
          },
        });

        const message = bountyFundedMessage({
          amount: bounty.amount,
          fundedAmount: balance.confirmed,
          contractAddress: bounty.contractAddress,
          expiryDate: bounty.locktime,
          issueNumber: bounty.issueNumber,
        });

        let newCommentId: number | bigint | undefined;

        switch (bounty.platform) {
          case Platform.GITLAB: {
            if (!bounty.gitlabProjectId) break;

            const gitlabProject = await prisma.gitLabProject.findUnique({
              where: { id: bounty.gitlabProjectId },
            });

            if (gitlabProject?.accessToken) {
              if (bounty.commentId == null) {
                newCommentId = await postIssueNote(
                  gitlabProject.instanceUrl,
                  gitlabProject.projectId,
                  bounty.issueNumber,
                  message,
                  gitlabProject.accessToken
                );
              } else {
                await updateIssueNote(
                  gitlabProject.instanceUrl,
                  gitlabProject.projectId,
                  bounty.issueNumber,
                  bounty.commentId,
                  message,
                  gitlabProject.accessToken
                );
              }
            } else {
              console.warn(
                `⚠️ No access token for GitLab project ${bounty.gitlabProjectId}`
              );
            }
            break;
          }
          case Platform.GITHUB:
          default: {
            if (bounty.commentId == null) {
              newCommentId = await postIssueComment(
                bounty.repoOwner,
                bounty.repoName,
                bounty.issueNumber,
                message,
                bounty.installationId ?? undefined,
              );
            } else {
              await updateIssueComment(
                bounty.repoOwner,
                bounty.repoName,
                bounty.commentId,
                message,
                bounty.installationId ?? undefined,
              );
            }
            break;
          }
        }

        // Update commentId if we created a new comment
        if (newCommentId && !bounty.commentId) {
          await prisma.bounty.update({
            where: { id: bounty.id },
            data: { commentId: newCommentId },
          });
        }

        fundedCount++;
      }
    } catch (error) {
      console.error(`Error checking bounty ${bounty.id}:`, error);
    }
  }

  return {
    checked: pending.length,
    funded: fundedCount,
  };
}

/**
 * Get most recent bounty by issue number and repo
 */
export async function getMostRecentBountyByIssueNumber(
  repoOwner: string,
  repoName: string,
  issueNumber: number,
) {
  return await prisma.bounty.findFirst({
    where: {
      repoOwner,
      repoName,
      issueNumber,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      attempts: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/**
 * Helper to create config and rebuild contract from a Bounty record
 */
function setupContractFromBounty(bounty: Bounty, network: Network) {
  const config = createConfig(
    network as Network,
    "./contracts/DynamicBounty.cash",
    `./oracle-key-${network}.json`,
  );

  const contract = rebuildBountyContract(config, {
    address: bounty.contractAddress,
    oraclePubkey: bounty.oraclePubkey,
    maintainerPKH: bounty.maintainerPKH,
    issueHash: bounty.issueHash,
    locktime: bounty.locktime,
  });

  return { config, contract };
}

export interface CompleteBountyResult {
  transaction: TransactionResult;
  commission: CommissionResult;
}

/**
 * Complete a bounty - pay the contributor after PR is merged
 *
 * @param bounty - The Bounty record from the database
 * @param contributorAddress - BCH address of the contributor to pay
 * @param network - Network to use (mainnet or testnet3)
 * @returns Transaction result with txid and commission info
 */
export async function completeBountyPayout(
  bounty: Bounty,
  contributorAddress: string,
  network: Network,
): Promise<CompleteBountyResult> {
  if (bounty.status !== "ACTIVE") {
    throw new Error(`Cannot complete bounty with status: ${bounty.status}`);
  }

  const { config, contract } = setupContractFromBounty(bounty, network);

  const fundedAmount = bounty.fundedAmount ?? bounty.amount;
  const txFee = bounty.feeAmount ?? BigInt(0);

  // Calculate commission
  const commission = calculateCommission(
    fundedAmount,
    txFee,
    bounty.platform,
    bounty.repoOwner,
    bounty.repoName
  );

  // Get oracle fee PKH if commission applies
  const oracleFeePKH =
    commission.commissionAmount > BigInt(0)
      ? getOracleFeePKH(config.oracleKeys)
      : null;

  const result = await completeBounty(
    contract,
    config.provider,
    contributorAddress,
    commission.contributorAmount,
    bounty.issueHash,
    config.oracleKeys.privateKey,
    oracleFeePKH,
    commission.commissionAmount,
  );

  // Update bounty status
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: {
      status: "CLAIMED",
    },
  });

  console.log(
    `✅ Bounty ${bounty.id} completed, paid to ${contributorAddress}`,
  );
  console.log(`   Contributor amount: ${commission.contributorAmount} sats`);
  if (commission.commissionAmount > BigInt(0)) {
    console.log(`   Commission: ${commission.commissionAmount} sats (${commission.commissionBps / 100}%)`);
  }
  console.log(`   TX: ${result.txid}`);

  return {
    transaction: result,
    commission,
  };
}

/**
 * Refund a bounty - return funds to maintainer (oracle-signed)
 *
 * Consolidates all contract UTXOs and returns total minus fee to maintainer.
 *
 * @param bounty - The Bounty record from the database
 * @param network - Network to use (mainnet or testnet3)
 * @returns Tuple of [TransactionResult, refundedAmount]
 */
export async function refundBountyToMaintainer(
  bounty: Bounty,
  network: Network,
): Promise<[TransactionResult, bigint]> {
  if (bounty.status !== "ACTIVE") {
    throw new Error(`Cannot refund bounty with status: ${bounty.status}`);
  }

  const { config, contract } = setupContractFromBounty(bounty, network);

  // refundBounty now calculates the amount from actual UTXOs
  const { transaction, refundedAmount } = await refundBounty(
    contract,
    config.provider,
    bounty.maintainerAddress,
    bounty.issueHash,
    config.oracleKeys.privateKey,
  );

  // Update bounty status
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: {
      status: "REFUNDED",
    },
  });

  console.log(`✅ Bounty ${bounty.id} refunded to ${bounty.maintainerAddress}`);
  console.log(`   TX: ${transaction.txid}`);

  return [transaction, refundedAmount];
}

/**
 * Timeout a bounty - automatic refund after locktime expires
 *
 * Consolidates all contract UTXOs and returns total minus fee to maintainer.
 *
 * @param bounty - The Bounty record from the database
 * @param network - Network to use (mainnet or testnet3)
 * @returns Tuple of [TransactionResult, refundedAmount]
 */
export async function timeoutBountyRefund(
  bounty: Bounty,
  network: Network,
): Promise<[TransactionResult, bigint]> {
  if (bounty.status !== "ACTIVE") {
    throw new Error(`Cannot timeout bounty with status: ${bounty.status}`);
  }

  const { config, contract } = setupContractFromBounty(bounty, network);

  const { transaction, refundedAmount } = await timeoutBounty(
    contract,
    config.provider,
    bounty.maintainerAddress,
    bounty.locktime,
  );

  // Update bounty status
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: {
      status: "EXPIRED",
    },
  });

  console.log(
    `✅ Bounty ${bounty.id} expired, refunded to ${bounty.maintainerAddress}`
  );
  console.log(`   TX: ${transaction.txid}`);

  return [transaction, refundedAmount];
}

/**
 * Check and process expired bounties
 * This should be run as a cron job to automatically refund expired bounties
 */
export async function processExpiredBounties(
  network: Network,
): Promise<{ checked: number; expired: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Get all active bounties that have passed their locktime
  const expired = await prisma.bounty.findMany({
    where: {
      status: "ACTIVE",
      locktime: { lte: now },
    },
  });

  let expiredCount = 0;

  for (const bounty of expired) {
    try {
      await timeoutBountyRefund(bounty, network);
      expiredCount++;
    } catch (error) {
      console.error(`Error processing expired bounty ${bounty.id}:`, error);
    }
  }

  return {
    checked: expired.length,
    expired: expiredCount,
  };
}

/**
 * Update bounty status comments on both issue and all related PRs
 *
 * Posts or updates the bot comment on:
 * - The original issue (shows bounty status + all attempts)
 * - Each PR attempt (shows individual claim status)
 *
 * @param id - The Bounty ID
 * @returns void
 */
export async function updateBountyComments(id: string): Promise<void> {
  const bounty = await prisma.bounty.findUnique({
    where: { id },
    include: { attempts: true, gitlabProject: true },
  });
  if (bounty == null) {
    throw new Error("Bounty not found");
  }
  const { repoOwner: owner, repoName: repo } = bounty;

  try {
    let issueMessage: string | undefined = undefined;

    switch (bounty.status) {
      case "ACTIVE":
        issueMessage = bountyFundedMessage({
          amount: bounty.amount,
          fundedAmount: bounty.fundedAmount,
          contractAddress: bounty.contractAddress,
          expiryDate: bounty.locktime,
          issueNumber: bounty.issueNumber,
          attempts: bounty.attempts,
        });
        break;
      case "CLAIMED":
        const winningAttempt = bounty.attempts.find(
          (a) => a.status === AttemptStatus.APPROVED,
        );
        if (winningAttempt == null || winningAttempt.settlementTxId == null)
          return;
        
        // Calculate commission for display
        const claimedCommission = calculateCommission(
          bounty.fundedAmount ?? bounty.amount,
          bounty.feeAmount ?? BigInt(0),
          bounty.platform,
          bounty.repoOwner,
          bounty.repoName,
        );
        
        issueMessage = bountyCompletedMessage({
          fundedAmount: bounty.fundedAmount ?? bounty.amount,
          contributorAmount: claimedCommission.contributorAmount,
          commissionAmount: claimedCommission.commissionAmount,
          commissionBps: claimedCommission.commissionBps,
          isZeroCommissionProject: claimedCommission.isZeroCommissionProject,
          contributorAddress: winningAttempt?.contributorAddress,
          contributorLogin: winningAttempt?.contributorLogin,
          issueNumber: bounty.issueNumber,
          network: fromPrismaToElectrumNetwork(bounty.network),
          prNumber: winningAttempt.prNumber,
          txId: winningAttempt.settlementTxId,
        });
        break;
    }

    const network = fromPrismaToElectrumNetwork(bounty.network);

    // Platform-specific comment posting
    switch (bounty.platform) {
      case Platform.GITLAB: {
        const { gitlabProject } = bounty;
        if (!gitlabProject?.accessToken) {
          console.warn(
            `⚠️ No access token for GitLab project ${bounty.gitlabProjectId}`
          );
          return;
        }

        // Post/update issue comment
        if (issueMessage) {
          if (bounty.commentId) {
            await updateIssueNote(
              gitlabProject.instanceUrl,
              gitlabProject.projectId,
              bounty.issueNumber,
              bounty.commentId,
              issueMessage,
              gitlabProject.accessToken
            );
          } else {
            const newCommentId = await postIssueNote(
              gitlabProject.instanceUrl,
              gitlabProject.projectId,
              bounty.issueNumber,
              issueMessage,
              gitlabProject.accessToken
            );
            if (newCommentId) {
              await updateBountyCommentId(bounty.id, newCommentId);
            }
          }
        }

        // Update MR comments for attempts
        for (const attempt of bounty.attempts) {
          try {
            let prMessage: string;

            switch (attempt.status) {
              case "PENDING":
                prMessage = claimRegisteredMessage({
                  issueNumber: bounty.issueNumber,
                  amount: bounty.fundedAmount ?? bounty.amount,
                  contributorAddress: attempt.contributorAddress,
                  contractAddress: bounty.contractAddress,
                });
                break;
              case "APPROVED":
                // Calculate commission for display on MR
                const mrCommission = calculateCommission(
                  bounty.fundedAmount ?? bounty.amount,
                  bounty.feeAmount ?? BigInt(0),
                  bounty.platform,
                  bounty.repoOwner,
                  bounty.repoName,
                );
                
                prMessage = bountyCompletedMessage({
                  issueNumber: bounty.issueNumber,
                  fundedAmount: bounty.fundedAmount ?? bounty.amount,
                  contributorAmount: mrCommission.contributorAmount,
                  commissionAmount: mrCommission.commissionAmount,
                  commissionBps: mrCommission.commissionBps,
                  isZeroCommissionProject: mrCommission.isZeroCommissionProject,
                  contributorAddress: attempt.contributorAddress,
                  contributorLogin: attempt.contributorLogin,
                  prNumber: attempt.prNumber,
                  txId: attempt.settlementTxId ?? "",
                  network,
                });
                break;
              case "REJECTED":
                prMessage = claimRejectedMessage({
                  issueNumber: bounty.issueNumber,
                });
                break;
            }

            if (attempt.commentId) {
              await updateMergeRequestNote(
                gitlabProject.instanceUrl,
                gitlabProject.projectId,
                attempt.prNumber,
                attempt.commentId,
                prMessage,
                gitlabProject.accessToken
              );
            } else {
              const newAttemptCommentId = await postMergeRequestNote(
                gitlabProject.instanceUrl,
                gitlabProject.projectId,
                attempt.prNumber,
                prMessage,
                gitlabProject.accessToken
              );
              if (newAttemptCommentId) {
                await prisma.attempt.update({
                  where: { id: attempt.id },
                  data: { commentId: newAttemptCommentId },
                });
              }
            }
          } catch (error) {
            console.error(
              `Error updating MR !${attempt.prNumber} comment:`,
              error
            );
          }
        }
        break;
      }
      case Platform.GITHUB:
      default: {
        const installationId = bounty.installationId ?? undefined;

        if (installationId == null) {
          throw new Error("Installation ID is required for GitHub bounties");
        }

        if (issueMessage) {
          if (bounty.commentId) {
            await updateIssueComment(
              owner,
              repo,
              bounty.commentId,
              issueMessage,
              installationId,
            );
          } else {
            const bountyNewCommentId = await postIssueComment(
              owner,
              repo,
              bounty.issueNumber,
              issueMessage,
              installationId,
            );
            if (bountyNewCommentId) {
              await updateBountyCommentId(bounty.id, bountyNewCommentId);
            }
          }
        }

        // Update each PR with its individual attempt status
        for (const attempt of bounty.attempts) {
          try {
            let prMessage: string;

            switch (attempt.status) {
              case "PENDING":
                prMessage = claimRegisteredMessage({
                  issueNumber: bounty.issueNumber,
                  amount: bounty.fundedAmount ?? bounty.amount,
                  contributorAddress: attempt.contributorAddress,
                  contractAddress: bounty.contractAddress,
                });
                break;
              case "APPROVED":
                // Calculate commission for display on PR
                const prCommission = calculateCommission(
                  bounty.fundedAmount ?? bounty.amount,
                  bounty.feeAmount ?? BigInt(0),
                  bounty.platform,
                  bounty.repoOwner,
                  bounty.repoName,
                );
                
                prMessage = bountyCompletedMessage({
                  issueNumber: bounty.issueNumber,
                  fundedAmount: bounty.fundedAmount ?? bounty.amount,
                  contributorAmount: prCommission.contributorAmount,
                  commissionAmount: prCommission.commissionAmount,
                  commissionBps: prCommission.commissionBps,
                  isZeroCommissionProject: prCommission.isZeroCommissionProject,
                  contributorAddress: attempt.contributorAddress,
                  contributorLogin: attempt.contributorLogin,
                  prNumber: attempt.prNumber,
                  txId: attempt.settlementTxId ?? "",
                  network,
                });
                break;
              case "REJECTED":
                prMessage = claimRejectedMessage({
                  issueNumber: bounty.issueNumber,
                });
                break;
            }

            if (attempt.commentId) {
              await updateIssueComment(
                owner,
                repo,
                attempt.commentId,
                prMessage,
                installationId,
              );
            } else {
              const attemptNewCommentId = await postIssueComment(
                owner,
                repo,
                attempt.prNumber,
                prMessage,
                installationId,
              );
              if (attemptNewCommentId) {
                await prisma.attempt.update({
                  where: { id: attempt.id },
                  data: { commentId: attemptNewCommentId },
                });
              }
            }
          } catch (error) {
            console.error(
              `Error updating PR #${attempt.prNumber} comment:`,
              error
            );
          }
        }
        break;
      }
    }

    console.log(`✅ Updated bounty comments for ${bounty.issueUrl}`);
  } catch (error) {
    console.error(`Error updating bounty comments for ${bounty.id}:`, error);
  }
}
