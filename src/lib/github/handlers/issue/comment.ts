import type {
  IssueCommentCreatedEvent,
  IssueCommentDeletedEvent,
} from "@octokit/webhooks-types";
import { prisma } from "@/lib/prisma";
import {
  createBountyFromCommand,
  getMostRecentBountyByIssueNumber,
} from "@/lib/bounty";
import { parseCommand } from "@/lib/commands";
import {
  postIssueComment,
  parseRepoFullName,
  getRepoBchNetwork,
} from "@/lib/github/api";
import * as messages from "@/lib/messages";
import { BountyStatus } from "@prisma/client";
import type { WebhookResponse } from "../types";

/**
 * Handle issue comment created/deleted event
 * Triggered when someone comments on an issue or deletes a comment
 */
export async function handleIssueComment(
  payload: IssueCommentCreatedEvent | IssueCommentDeletedEvent,
): Promise<WebhookResponse> {
  const { action, comment, issue, repository } = payload;

  if (action === "deleted") {
    try {
      const { owner: delOwner, repo: delRepo } = parseRepoFullName(
        repository.full_name,
      );
      const bounty = await getMostRecentBountyByIssueNumber(
        delOwner,
        delRepo,
        issue.number,
      );
      if (bounty == null) throw new Error("Bounty not found");
      await prisma.bounty.delete({
        where: {
          issueUrl: issue.html_url,
          commentId: comment.id,
          id: bounty.id,
          status: BountyStatus.PENDING_FUNDING,
        },
      });
      return {
        success: true,
        message: "Deleted pending bounty",
      };
    } catch (e) {
      return {
        success: false,
        message: "Failed to delete pending bounty",
      };
    }
  }

  // Only handle new comments
  if (action !== "created" && action !== "deleted") {
    return { success: true, message: "Ignored: not a new comment" };
  }

  const commentBody = comment.body.trim();

  // Check if comment contains a bounty command
  if (!commentBody.startsWith("/bounty")) {
    return { success: true, message: "Ignored: not a bounty command" };
  }

  // Parse the command
  const command = parseCommand(commentBody);
  if (!command.success) {
    // Reply with error message
    await postIssueComment(
      parseRepoFullName(repository.full_name).owner,
      parseRepoFullName(repository.full_name).repo,
      issue.number,
      messages.invalidCommandError(command.error!),
      "installation" in payload ? payload.installation?.id : undefined,
    );

    return {
      success: false,
      error: command.error,
    };
  }

  // Extract issue information
  const issueUrl = issue.html_url;
  const issueNumber = issue.number;
  const { owner, repo } = parseRepoFullName(repository.full_name);
  const authorAssociation = comment.author_association;
  const isMaintainer =
    authorAssociation === "OWNER" ||
    authorAssociation === "MEMBER" ||
    authorAssociation === "COLLABORATOR";

  // Only allow repo maintainers to create bounties
  if (!isMaintainer) {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.unauthorizedError(authorAssociation),
      "installation" in payload ? payload.installation?.id : undefined,
    );

    return {
      success: false,
      error: "Unauthorized: only maintainers can create bounties",
    };
  }

  if (issue.state === "closed") {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.issueClosedError(),
      "installation" in payload ? payload.installation?.id : undefined,
    );

    return {
      success: false,
      error: "Issue is closed",
    };
  }

  // Check if bounty already exists for this issue
  const existingBounty = await prisma.bounty.findFirst({
    where: {
      issueUrl,
      status: {
        notIn: [BountyStatus.REFUNDED, BountyStatus.EXPIRED],
      },
    },
  });

  if (existingBounty) {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.bountyExistsError(
        existingBounty.contractAddress,
        existingBounty.status,
        existingBounty.amount,
      ),
      "installation" in payload ? payload.installation?.id : undefined,
    );

    return {
      success: false,
      error: "Bounty already exists for this issue",
    };
  }

  // Create the bounty
  try {
    const installationId =
      "installation" in payload ? payload.installation?.id : undefined;

    if (installationId == null) {
      throw new Error("Installation ID is not defined");
    }

    const network = await getRepoBchNetwork(owner, repo, installationId);

    const bounty = await createBountyFromCommand({
      issueUrl,
      issueNumber,
      issueTitle: issue.title,
      repoOwner: owner,
      repoName: repo,
      amountBCH: command.amount!,
      refundAddress: command.refundAddress!,
      expiryDays: command.expiryDays,
      network,
      installationId,
    });

    // Post bounty created message
    const commentId = await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.bountyCreatedMessage({
        amount: bounty.amount,
        feeAmount: bounty.feeAmount,
        contractAddress: bounty.contractAddress,
        refundAddress: command.refundAddress!,
        expiryDate: bounty.locktime,
        status: bounty.status,
      }),
      installationId,
    );

    // Store the comment ID for future updates
    if (commentId) {
      await prisma.bounty.update({
        where: { id: bounty.id },
        data: { commentId },
      });
    }

    return {
      success: true,
      bounty: {
        id: bounty.id,
        contractAddress: bounty.contractAddress,
        amount: bounty.amount,
      },
    };
  } catch (error) {
    console.error("Error creating bounty:", error);

    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.bountyCreationError((error as Error).message),
      "installation" in payload ? payload.installation?.id : undefined,
    );

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
