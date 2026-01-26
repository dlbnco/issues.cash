/**
 * GitLab Note Handler
 *
 * Handles comments on issues (Note Hook with noteable_type: Issue)
 * Parses /bounty commands similar to GitHub issue comments
 */

import type { GitLabNoteEvent } from "../types";
import { isNoteOnIssue } from "../types";
import { prisma } from "@/lib/prisma";
import { createBountyFromCommand, getMostRecentBountyByIssueNumber } from "@/lib/bounty";
import { parseCommand, validateAddressForNetwork } from "@/lib/commands";
import {
  postIssueNote,
  deleteIssueNote,
  parsePathWithNamespace,
  constructIssueUrl,
  extractInstanceUrl,
  getProjectBchNetwork,
  isUserMaintainer,
} from "../api";
import * as messages from "@/lib/messages";
import { BountyStatus } from "@prisma/client";
import type { WebhookResponse } from "@/lib/webhooks/types";
import type { GitLabCredentials } from "../verify";
import { DEFAULT_BCH_NETWORK } from "@/lib/constants";

/**
 * Handle GitLab note (comment) on an issue
 */
export async function handleNoteOnIssue(
  payload: GitLabNoteEvent,
  credentials: GitLabCredentials
): Promise<WebhookResponse> {
  // Only handle notes on issues
  if (!isNoteOnIssue(payload)) {
    return { success: true, message: "Ignored: not a note on an issue" };
  }

  const { object_attributes: note, issue, project, user } = payload;

  // Handle note deletion (action: "update" can mean deletion in some cases)
  // Note: GitLab doesn't have a separate "deleted" action for notes in webhooks
  // We'll handle this differently - bounty deletion happens when issue is closed

  // Only handle new notes
  if (note.action !== "create") {
    return { success: true, message: "Ignored: not a new note" };
  }

  const noteBody = note.note.trim();

  // Check if comment contains a bounty command
  if (!noteBody.startsWith("/bounty")) {
    return { success: true, message: "Ignored: not a bounty command" };
  }

  // Parse the command
  const command = parseCommand(noteBody);
  if (!command.success) {
    // Reply with error message if we have an access token
    if (credentials.accessToken) {
      await postIssueNote(
        extractInstanceUrl(project.web_url),
        project.id,
        issue.iid,
        messages.invalidCommandError(command.error!),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: command.error,
    };
  }

  // Extract issue information
  const instanceUrl = extractInstanceUrl(project.web_url);
  const issueUrl = constructIssueUrl(project.web_url, issue.iid);
  const issueNumber = issue.iid;
  const { owner, name: repoName } = parsePathWithNamespace(
    project.path_with_namespace
  );

  // Check if user is a maintainer
  // We need an access token to check permissions via API
  if (credentials.accessToken) {
    const isMaintainer = await isUserMaintainer(
      instanceUrl,
      project.id,
      user.id,
      credentials.accessToken
    );

    if (!isMaintainer) {
      await postIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.unauthorizedError("non-maintainer"),
        credentials.accessToken
      );

      return {
        success: false,
        error: "Unauthorized: only maintainers can create bounties",
      };
    }
  } else {
    // Without access token, we can't verify maintainer status
    // For now, we'll trust that the webhook is configured correctly
    console.warn(
      `⚠️ Cannot verify maintainer status for ${user.username} - no access token`
    );
  }

  // Handle cancel command
  if (command.type === "cancel") {
    return handleCancelCommand(
      instanceUrl,
      project.id,
      issueUrl,
      issueNumber,
      user.username,
      credentials.accessToken ?? undefined,
    );
  }

  // Check if issue is closed
  if (issue.state === "closed") {
    if (credentials.accessToken) {
      await postIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.issueClosedError(),
        credentials.accessToken
      );
    }

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
    if (credentials.accessToken) {
      await postIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.bountyExistsError(
          existingBounty.contractAddress,
          existingBounty.status,
          existingBounty.amount
        ),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: "Bounty already exists for this issue",
    };
  }

  // Create the bounty
  try {
    // Get network from project CI/CD variables if we have a token
    let network = DEFAULT_BCH_NETWORK;
    if (credentials.accessToken) {
      network = await getProjectBchNetwork(
        instanceUrl,
        project.id,
        credentials.accessToken
      );
    }

    // Validate address matches the repository's network
    const addressValidation = validateAddressForNetwork(
      command.refundAddress!,
      network
    );
    if (!addressValidation.valid) {
      if (credentials.accessToken) {
        await postIssueNote(
          instanceUrl,
          project.id,
          issue.iid,
          messages.networkMismatchError(
            network,
            network === "mainnet" ? "bitcoincash:" : "bchtest:",
            addressValidation.error!
          ),
          credentials.accessToken
        );
      }

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
      repoName: repoName,
      amountBCH: command.amount!,
      refundAddress: command.refundAddress!,
      expiryDays: command.expiryDays,
      network,
      platform: "GITLAB",
      gitlabProjectId: credentials.projectId ?? undefined,
    });

    // Post bounty created message
    let commentId: number | undefined;
    if (credentials.accessToken) {
      commentId = await postIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.bountyCreatedMessage({
          amount: bounty.amount,
          feeAmount: bounty.feeAmount,
          contractAddress: bounty.contractAddress,
          refundAddress: command.refundAddress!,
          expiryDate: bounty.locktime,
          status: bounty.status,
        }),
        credentials.accessToken
      );
    }

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
    console.error("Error creating GitLab bounty:", error);

    if (credentials.accessToken) {
      await postIssueNote(
        instanceUrl,
        project.id,
        issue.iid,
        messages.bountyCreationError((error as Error).message),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Handle GitLab note deletion (if bounty command was deleted)
 * Note: GitLab webhooks don't have a note deletion event, so this is called
 * when we detect a deleted comment through other means (if applicable)
 */
export async function handleNoteDeleted(
  projectPathWithNamespace: string,
  issueIid: number,
  noteId: number
): Promise<WebhookResponse> {
  try {
    const { owner, name: repoName } = parsePathWithNamespace(
      projectPathWithNamespace
    );

    const bounty = await getMostRecentBountyByIssueNumber(
      owner,
      repoName,
      issueIid
    );

    if (!bounty) {
      return { success: true, message: "No bounty found for this issue" };
    }

    // Only delete if the comment ID matches and bounty is pending
    if (bounty.commentId === BigInt(noteId) && bounty.status === BountyStatus.PENDING_FUNDING) {
      await prisma.bounty.delete({
        where: { id: bounty.id },
      });

      return { success: true, message: "Deleted pending bounty" };
    }

    return { success: true, message: "No matching pending bounty to delete" };
  } catch (error) {
    console.error("Error handling note deletion:", error);
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
  instanceUrl: string,
  projectId: number,
  issueUrl: string,
  issueIid: number,
  username: string,
  accessToken?: string,
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
    if (accessToken) {
      await postIssueNote(
        instanceUrl,
        projectId,
        issueIid,
        messages.noPendingBountyError(),
        accessToken,
      );
    }

    return {
      success: false,
      error: "No pending bounty to cancel",
    };
  }

  // Check if bounty is already funded
  if (bounty.status !== BountyStatus.PENDING_FUNDING) {
    if (accessToken) {
      await postIssueNote(
        instanceUrl,
        projectId,
        issueIid,
        messages.bountyAlreadyFundedError(),
        accessToken,
      );
    }

    return {
      success: false,
      error: "Cannot cancel: bounty is already funded",
    };
  }

  // Delete the bot's bounty comment if it exists
  if (bounty.commentId && accessToken) {
    await deleteIssueNote(
      instanceUrl,
      projectId,
      issueIid,
      bounty.commentId,
      accessToken,
    );
  }

  // Delete the bounty from database
  await prisma.bounty.delete({
    where: { id: bounty.id },
  });

  // Post confirmation message
  if (accessToken) {
    await postIssueNote(
      instanceUrl,
      projectId,
      issueIid,
      messages.bountyCancelledMessage(username),
      accessToken,
    );
  }

  return {
    success: true,
    message: "Bounty cancelled",
  };
}
