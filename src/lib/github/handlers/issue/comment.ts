import type {
  IssueCommentCreatedEvent,
  IssueCommentDeletedEvent,
} from "@octokit/webhooks-types";
import { prisma } from "@/lib/prisma";
import {
  createBountyFromCommand,
  getMostRecentBountyByIssueNumber,
} from "@/lib/bounty";
import { parseCommand, validateAddressForNetwork } from "@/lib/commands";
import {
  postIssueComment,
  deleteIssueComment,
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
  const installationId =
    "installation" in payload ? payload.installation?.id : undefined;

  // Only allow repo maintainers to create/cancel bounties
  if (!isMaintainer) {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.unauthorizedError(authorAssociation),
      installationId,
    );

    return {
      success: false,
      error: "Unauthorized: only maintainers can create bounties",
    };
  }

  // Handle cancel command
  if (command.type === "cancel") {
    return handleCancelCommand(
      owner,
      repo,
      issueUrl,
      issueNumber,
      comment.user.login,
      installationId,
    );
  }

  if (issue.state === "closed") {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.issueClosedError(),
      installationId,
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
      installationId,
    );

    return {
      success: false,
      error: "Bounty already exists for this issue",
    };
  }

  // Create the bounty
  try {
    if (installationId == null) {
      throw new Error("Installation ID is not defined");
    }

    const network = await getRepoBchNetwork(owner, repo, installationId);

    // Validate address matches the repository's network
    const addressValidation = validateAddressForNetwork(
      command.refundAddress!,
      network
    );
    if (!addressValidation.valid) {
      await postIssueComment(
        owner,
        repo,
        issueNumber,
        messages.networkMismatchError(
          network,
          network === "mainnet" ? "bitcoincash:" : "bchtest:",
          addressValidation.error!
        ),
        installationId
      );

      return {
        success: false,
        error: addressValidation.error,
      };
    }

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

/**
 * Handle /bounty cancel command
 * Deletes a pending (unfunded) bounty and its associated bot comment
 */
async function handleCancelCommand(
  owner: string,
  repo: string,
  issueUrl: string,
  issueNumber: number,
  username: string,
  installationId?: number,
): Promise<WebhookResponse> {
  // Find existing bounty for this issue
  const bounty = await prisma.bounty.findFirst({
    where: {
      issueUrl,
      status: {
        notIn: [BountyStatus.REFUNDED, BountyStatus.EXPIRED],
      },
    },
  });

  if (!bounty) {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.noPendingBountyError(),
      installationId,
    );

    return {
      success: false,
      error: "No pending bounty to cancel",
    };
  }

  // Check if bounty is already funded
  if (bounty.status !== BountyStatus.PENDING_FUNDING) {
    await postIssueComment(
      owner,
      repo,
      issueNumber,
      messages.bountyAlreadyFundedError(),
      installationId,
    );

    return {
      success: false,
      error: "Cannot cancel: bounty is already funded",
    };
  }

  // Delete the bot's bounty comment if it exists
  if (bounty.commentId) {
    await deleteIssueComment(owner, repo, bounty.commentId, installationId);
  }

  // Delete the bounty from database
  await prisma.bounty.delete({
    where: { id: bounty.id },
  });

  // Post confirmation message
  await postIssueComment(
    owner,
    repo,
    issueNumber,
    messages.bountyCancelledMessage(username),
    installationId,
  );

  return {
    success: true,
    message: "Bounty cancelled",
  };
}
