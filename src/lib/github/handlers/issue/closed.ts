import type { IssuesClosedEvent } from "@octokit/webhooks-types";
import {
  getMostRecentBountyByIssueNumber,
  refundBountyToMaintainer,
} from "@/lib/bounty";
import {
  postIssueComment,
  parseRepoFullName,
  updateIssueComment,
  createOrUpdateComment,
  getRepoBchNetwork,
} from "@/lib/github/api";
import * as messages from "@/lib/messages";
import { AttemptStatus, BountyStatus } from "@prisma/client";
import type { WebhookResponse } from "../types";

/**
 * Handle issue closed event
 * Triggers bounty refund if no pending attempts
 */
export async function handleIssueClosed(
  payload: IssuesClosedEvent,
): Promise<WebhookResponse> {
  const { action, issue, repository } = payload;

  // Only handle closed issues
  if (action !== "closed") {
    return { success: true, message: "Ignored: issue not closed" };
  }

  const bounty = await getMostRecentBountyByIssueNumber(
    repository.full_name,
    issue.number,
  );

  if (bounty == null) {
    return {
      success: true,
      message: "Ignored: no bounty found",
    };
  }

  const { owner, repo } = parseRepoFullName(repository.full_name);

  const installationId =
    "installation" in payload ? payload.installation?.id : undefined;

  if (installationId == null) {
    throw new Error("Installation ID is undefined");
  }

  switch (bounty.status) {
    case BountyStatus.CLAIMED:
    case BountyStatus.REFUNDED:
    case BountyStatus.PENDING_FUNDING:
    case BountyStatus.EXPIRED:
      return {
        success: true,
        message: "Ignored: contract empty",
      };

    case BountyStatus.ACTIVE:
      if (bounty.attempts.some((a) => a.status === AttemptStatus.PENDING)) {
        // Post error message about pending attempts
        await postIssueComment(
          owner,
          repo,
          issue.number,
          messages.errorRefundPendingAttemptsFound(bounty.attempts),
          installationId,
        );

        return {
          success: true,
          message: `Error: can't refund contract, pending attempts found`,
        };
      }

      const network = await getRepoBchNetwork(owner, repo, installationId);

      // Process refund
      const result = await refundBountyToMaintainer(bounty, network);

      const message = messages.bountyRefundedMessage({
        amount: result[1],
        issueNumber: bounty.issueNumber,
        maintainerAddress: bounty.maintainerAddress,
        txId: result[0].txid,
        network,
      });

      await createOrUpdateComment(
        owner,
        repo,
        issue.number,
        message,
        bounty.commentId,
        installationId,
      );

      return {
        success: true,
        message: "Bounty refunded successfully",
      };
  }
}
