/**
 * GitLab Issue Handler
 *
 * Handles issue events (Issue Hook)
 * - Issue closed -> refund bounty
 */

import type { GitLabIssueEvent } from "../types";
import { prisma } from "@/lib/prisma";
import { refundBountyToMaintainer } from "@/lib/bounty";
import {
  createOrUpdateIssueNote,
  constructIssueUrl,
  extractInstanceUrl,
  getProjectBchNetwork,
} from "../api";
import * as messages from "@/lib/messages";
import { AttemptStatus, BountyStatus } from "@prisma/client";
import type { WebhookResponse } from "@/lib/webhooks/types";
import type { GitLabCredentials } from "../verify";
import { fromPrismaToElectrumNetwork } from "@/lib/network";
import { DEFAULT_BCH_NETWORK } from "@/lib/constants";
import type { Bounty, Attempt } from "@prisma/client";

type BountyWithAttempts = Bounty & { attempts: Attempt[] };

/**
 * Handle GitLab issue closed event
 * Triggers refund for active bounties with no pending claims
 */
export async function handleIssueClosed(
  payload: GitLabIssueEvent,
  credentials: GitLabCredentials
): Promise<WebhookResponse> {
  const { object_attributes: issue, project } = payload;

  // Only handle close action
  if (issue.action !== "close") {
    return { success: true, message: "Ignored: not a close action" };
  }

  const instanceUrl = extractInstanceUrl(project.web_url);
  const issueUrl = constructIssueUrl(project.web_url, issue.iid);

  // Find active bounty for this issue
  const bounty = await prisma.bounty.findFirst({
    where: {
      issueUrl,
      status: BountyStatus.ACTIVE,
    },
    include: {
      attempts: true,
    },
  }) as BountyWithAttempts | null;

  if (!bounty) {
    return { success: true, message: "No active bounty for this issue" };
  }

  // Check if there are any pending attempts
  const hasPendingAttempts = bounty.attempts.some(
    (attempt) => attempt.status === AttemptStatus.PENDING
  );

  if (hasPendingAttempts) {
    // Post error message about pending attempts
    if (credentials.accessToken) {
      await createOrUpdateIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.errorRefundPendingAttemptsFound(bounty.attempts),
        bounty.commentId,
        credentials.accessToken
      );
    }

    return {
      success: true,
      message: "Cannot refund: pending attempts found",
    };
  }

  // Refund the bounty
  try {
    // Get network from project variables or use bounty's stored network
    let network = fromPrismaToElectrumNetwork(bounty.network);
    if (credentials.accessToken) {
      try {
        network = await getProjectBchNetwork(
          instanceUrl,
          project.id,
          credentials.accessToken
        );
      } catch {
        // Use bounty's stored network as fallback
      }
    }

    const [result, amount] = await refundBountyToMaintainer(bounty, network);

    if (credentials.accessToken) {
      const message = messages.bountyRefundedMessage({
        amount,
        issueNumber: bounty.issueNumber,
        maintainerAddress: bounty.maintainerAddress,
        txId: result.txid,
        network,
      });

      await createOrUpdateIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        message,
        bounty.commentId,
        credentials.accessToken
      );
    }

    return {
      success: true,
      message: `Bounty refunded: ${result.txid}`,
    };
  } catch (error) {
    console.error("Error refunding GitLab bounty:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
