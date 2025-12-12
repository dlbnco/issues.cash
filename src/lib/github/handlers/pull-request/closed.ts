import type { PullRequestClosedEvent } from "@octokit/webhooks-types";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@prisma/client";
import type { WebhookResponse } from "../types";
import { updateBountyComments } from "@/lib/bounty";

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

  if (action === "closed") {
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
              repoFullName: true,
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

  // TODO: Implement oracle signing for bounty completion
  // 1. Check if PR closes an issue with an active bounty
  // 2. Verify PR was actually merged
  // 3. Sign message: "COMPLETE" + issueHash + contributorPKH
  // 4. Update bounty status in database
  // 5. Optionally auto-trigger contract transaction

  return {
    success: true,
    message: "PR merged - oracle signing not implemented yet",
  };
}
