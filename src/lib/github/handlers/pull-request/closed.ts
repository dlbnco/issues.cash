import type { PullRequestClosedEvent } from "@octokit/webhooks-types";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@prisma/client";
import type { WebhookResponse } from "../types";
import { updateBountyComments, completeBountyPayout } from "@/lib/bounty";
import { fromPrismaToElectrumNetwork } from "@/lib/network";

/**
 * Handle pull request closed event
 * Triggered when PR is closed or merged
 */
export async function handlePullRequestClosed(
  payload: PullRequestClosedEvent,
): Promise<WebhookResponse> {
  const { action, pull_request } = payload;

  // Only handle closed PRs
  if (action !== "closed") {
    return { success: true, message: "Ignored: PR not closed" };
  }

  if (pull_request.merged === false) {
    try {
      const attempt = await prisma.attempt.findUnique({
        where: {
          prUrl: pull_request.html_url,
        },
        include: {
          bounty: {
            select: {
              id: true,
              issueNumber: true,
              repoOwner: true,
              repoName: true,
            },
          },
        },
      });

      if (!attempt) {
        return {
          success: true,
          message: "No claim found for this PR",
        };
      }

      if (attempt.status !== AttemptStatus.PENDING) {
        return {
          success: true,
          message: `Claim already processed (status: ${attempt.status})`,
        };
      }

      await prisma.attempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: AttemptStatus.REJECTED,
          updatedAt: new Date(),
        },
      });

      await updateBountyComments(attempt.bounty.id);

      return {
        success: true,
        message: "Attempt marked as rejected",
      };
    } catch (error) {
      // Attempt not found - PR doesn't have a claim
      return {
        success: true,
        message: "No claim found for this PR",
      };
    }
  }

  if (pull_request.merged === true) {
    try {
      const attempt = await prisma.attempt.findUnique({
        where: {
          prUrl: pull_request.html_url,
        },
        include: {
          bounty: true,
        },
      });

      if (!attempt) {
        return {
          success: true,
          message: "No claim found for this merged PR",
        };
      }

      if (attempt.status !== AttemptStatus.PENDING) {
        return {
          success: true,
          message: `Claim already processed (status: ${attempt.status})`,
        };
      }

      const bounty = attempt.bounty;

      if (bounty.status !== "ACTIVE") {
        return {
          success: true,
          message: `Bounty is not active (status: ${bounty.status})`,
        };
      }

      const network = fromPrismaToElectrumNetwork(bounty.network);

      const { transaction, commission } = await completeBountyPayout(
        bounty,
        attempt.contributorAddress,
        network,
      );

      await prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.APPROVED,
          settlementTxId: transaction.txid,
          updatedAt: new Date(),
        },
      });

      await updateBountyComments(bounty.id);

      const commissionInfo = commission.commissionAmount > BigInt(0)
        ? ` (commission: ${commission.commissionAmount} sats)`
        : "";

      return {
        success: true,
        message: `Bounty completed - paid to ${attempt.contributorAddress} (tx: ${transaction.txid})${commissionInfo}`,
        bounty: {
          id: bounty.id,
          contractAddress: bounty.contractAddress,
          amount: Number(bounty.amount),
        },
      };
    } catch (error) {
      console.error("Error completing bounty:", error);
      return {
        success: false,
        error: `Failed to complete bounty: ${(error as Error).message}`,
      };
    }
  }

  return {
    success: true,
    message: "PR merged but no bounty to process",
  };
}
