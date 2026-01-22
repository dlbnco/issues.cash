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
      const attempt = await prisma.attempt.update({
        where: {
          prUrl: pull_request.html_url,
        },
        data: {
          status: AttemptStatus.REJECTED,
          updatedAt: new Date(),
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

      const bounty = attempt.bounty;

      if (bounty.status !== "ACTIVE") {
        return {
          success: true,
          message: `Bounty is not active (status: ${bounty.status})`,
        };
      }

      const network = fromPrismaToElectrumNetwork(bounty.network);

      const txResult = await completeBountyPayout(
        bounty,
        attempt.contributorAddress,
        network,
      );

      await prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.APPROVED,
          settlementTxId: txResult.txid,
          updatedAt: new Date(),
        },
      });

      await updateBountyComments(bounty.id);

      return {
        success: true,
        message: `Bounty completed - paid to ${attempt.contributorAddress} (tx: ${txResult.txid})`,
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
