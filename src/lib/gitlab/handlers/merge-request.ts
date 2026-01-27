/**
 * GitLab Merge Request Handler
 *
 * Handles merge request events (Merge Request Hook)
 * - MR opened/updated -> parse /claim commands
 * - MR merged -> payout to contributor
 * - MR closed (not merged) -> reject claim
 */

import type { GitLabMergeRequestEvent } from "../types";
import { prisma } from "@/lib/prisma";
import {
  getMostRecentBountyByIssueNumber,
  completeBountyPayout,
  updateBountyComments,
} from "@/lib/bounty";
import { createOrUpdateAttempt } from "@/lib/attempt";
import { parseClaimCommand, validateAddressForNetwork } from "@/lib/commands";
import {
  postMergeRequestNote,
  updateMergeRequestNote,
  parsePathWithNamespace,
  constructMergeRequestUrl,
  extractInstanceUrl,
} from "../api";
import * as messages from "@/lib/messages";
import { AttemptStatus, BountyStatus } from "@prisma/client";
import type { WebhookResponse } from "@/lib/webhooks/types";
import type { GitLabCredentials } from "../verify";
import { fromPrismaToElectrumNetwork } from "@/lib/network";

/**
 * Handle GitLab merge request event
 */
export async function handleMergeRequest(
  payload: GitLabMergeRequestEvent,
  credentials: GitLabCredentials
): Promise<WebhookResponse> {
  const { object_attributes: mr, project } = payload;
  const action = mr.action;

  const instanceUrl = extractInstanceUrl(project.web_url);
  const mrUrl = constructMergeRequestUrl(project.web_url, mr.iid);
  const { owner, name: repoName } = parsePathWithNamespace(
    project.path_with_namespace
  );

  // Route based on action
  switch (action) {
    case "open":
    case "update":
    case "reopen":
      return handleMergeRequestOpenedOrEdited(
        payload,
        credentials,
        instanceUrl,
        mrUrl,
        owner,
        repoName
      );

    case "merge":
      return handleMergeRequestMerged(
        payload,
        credentials,
        instanceUrl,
        owner,
        repoName
      );

    case "close":
      return handleMergeRequestClosed(
        payload,
        credentials,
        instanceUrl,
        owner,
        repoName
      );

    default:
      return { success: true, message: `Ignored MR action: ${action}` };
  }
}

/**
 * Handle MR opened/updated/reopened - parse /claim commands
 */
async function handleMergeRequestOpenedOrEdited(
  payload: GitLabMergeRequestEvent,
  credentials: GitLabCredentials,
  instanceUrl: string,
  mrUrl: string,
  owner: string,
  repoName: string
): Promise<WebhookResponse> {
  const { object_attributes: mr, project, user } = payload;
  const mrBody = mr.description?.trim() || "";
  const mrNumber = mr.iid;
  const contributorLogin = user.username;

  // Check if MR body contains a /claim command
  if (!mrBody.includes("/claim")) {
    return { success: true, message: "Ignored: no /claim command found" };
  }

  // Parse the claim command
  const claimCommand = parseClaimCommand(mrBody);

  if (!claimCommand.success) {
    if (credentials.accessToken) {
      await postMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
        messages.invalidClaimCommandError(claimCommand.error!),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: claimCommand.error,
    };
  }

  // Find the bounty for the claimed issue
  const bounty = await getMostRecentBountyByIssueNumber(
    owner,
    repoName,
    claimCommand.issueNumber!
  );

  if (!bounty) {
    if (credentials.accessToken) {
      await postMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
        messages.noBountyFoundError(claimCommand.issueNumber!),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: `No bounty found for issue #${claimCommand.issueNumber}`,
    };
  }

  // Check if bounty is active (funded)
  if (bounty.status !== "ACTIVE") {
    if (credentials.accessToken) {
      await postMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
        messages.bountyNotActiveError(
          claimCommand.issueNumber!,
          bounty.status,
          bounty.contractAddress
        ),
        credentials.accessToken
      );
    }

    return {
      success: false,
      error: `Bounty for issue #${claimCommand.issueNumber} is not active (status: ${bounty.status})`,
    };
  }

  // Validate contributor address matches network
  const network = fromPrismaToElectrumNetwork(bounty.network);
  const addressValidation = validateAddressForNetwork(
    claimCommand.contributorAddress!,
    network
  );

  if (!addressValidation.valid) {
    if (credentials.accessToken) {
      await postMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
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

  // Create or update the attempt
  const attempt = await createOrUpdateAttempt({
    bountyId: bounty.id,
    prNumber: mrNumber,
    prUrl: mrUrl,
    contributorLogin,
    contributorAddress: claimCommand.contributorAddress!,
    status: AttemptStatus.PENDING,
  });

  // Post claim registered message
  if (credentials.accessToken) {
    const commentId = await postMergeRequestNote(
      instanceUrl,
      project.id,
      mrNumber,
      messages.claimRegisteredMessage({
        issueNumber: claimCommand.issueNumber!,
        amount: bounty.amount,
        contributorAddress: claimCommand.contributorAddress!,
        contractAddress: bounty.contractAddress,
      }),
      credentials.accessToken
    );

    // Store comment ID
    if (commentId) {
      await prisma.attempt.update({
        where: { id: attempt.id },
        data: { commentId },
      });
    }
  }

  // Update the issue note with attempts table
  await updateBountyComments(bounty.id);

  return {
    success: true,
    message: `Claim registered for issue #${claimCommand.issueNumber}`,
  };
}

/**
 * Handle MR merged - payout to contributor
 */
async function handleMergeRequestMerged(
  payload: GitLabMergeRequestEvent,
  credentials: GitLabCredentials,
  instanceUrl: string,
  owner: string,
  repoName: string
): Promise<WebhookResponse> {
  const { object_attributes: mr, project, user } = payload;
  const mrNumber = mr.iid;
  const mrUrl = constructMergeRequestUrl(project.web_url, mrNumber);

  // Find attempt for this MR
  const attempt = await prisma.attempt.findUnique({
    where: { prUrl: mrUrl },
    include: { bounty: true },
  });

  if (!attempt) {
    return { success: true, message: "No claim found for this MR" };
  }

  if (attempt.status !== AttemptStatus.PENDING) {
    return {
      success: true,
      message: `Claim already processed (status: ${attempt.status})`,
    };
  }

  const bounty = attempt.bounty;

  if (bounty.status !== BountyStatus.ACTIVE) {
    return {
      success: false,
      error: `Bounty is not active (status: ${bounty.status})`,
    };
  }

  // Complete the bounty - pay contributor
  try {
    const network = fromPrismaToElectrumNetwork(bounty.network);
    const { transaction, commission } = await completeBountyPayout(
      bounty,
      attempt.contributorAddress,
      network
    );

    // Update attempt status
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.APPROVED,
        settlementTxId: transaction.txid,
      },
    });

    // Update the issue note with attempts table
    await updateBountyComments(bounty.id);

    // Post completion message
    if (credentials.accessToken) {
      const completionMessage = messages.bountyCompletedMessage({
        issueNumber: bounty.issueNumber,
        fundedAmount: bounty.fundedAmount ?? bounty.amount,
        contributorAmount: commission.contributorAmount,
        commissionAmount: commission.commissionAmount,
        commissionBps: commission.commissionBps,
        isZeroCommissionProject: commission.isZeroCommissionProject,
        contributorLogin: attempt.contributorLogin,
        contributorAddress: attempt.contributorAddress,
        prNumber: mrNumber,
        txId: transaction.txid,
        network,
      });

      if (attempt.commentId) {
        await updateMergeRequestNote(
          instanceUrl,
          project.id,
          mrNumber,
          attempt.commentId,
          completionMessage,
          credentials.accessToken
        );
      } else {
        await postMergeRequestNote(
          instanceUrl,
          project.id,
          mrNumber,
          completionMessage,
          credentials.accessToken
        );
      }
    }

    return {
      success: true,
      message: `Bounty paid: ${transaction.txid}`,
    };
  } catch (error) {
    console.error("Error completing GitLab bounty:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Handle MR closed (not merged) - reject claim
 */
async function handleMergeRequestClosed(
  payload: GitLabMergeRequestEvent,
  credentials: GitLabCredentials,
  instanceUrl: string,
  owner: string,
  repoName: string
): Promise<WebhookResponse> {
  const { object_attributes: mr, project } = payload;
  const mrNumber = mr.iid;
  const mrUrl = constructMergeRequestUrl(project.web_url, mrNumber);

  // Find attempt for this MR
  const attempt = await prisma.attempt.findUnique({
    where: { prUrl: mrUrl },
    include: { bounty: true },
  });

  if (!attempt) {
    return { success: true, message: "No claim found for this MR" };
  }

  if (attempt.status !== AttemptStatus.PENDING) {
    return {
      success: true,
      message: `Claim already processed (status: ${attempt.status})`,
    };
  }

  // Reject the attempt
  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { status: AttemptStatus.REJECTED },
  });

  // Update the issue note with attempts table
  await updateBountyComments(attempt.bounty.id);

  // Post rejection message
  if (credentials.accessToken) {
    const rejectionMessage = messages.claimRejectedMessage({
      issueNumber: attempt.bounty.issueNumber,
    });

    if (attempt.commentId) {
      await updateMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
        attempt.commentId,
        rejectionMessage,
        credentials.accessToken
      );
    } else {
      await postMergeRequestNote(
        instanceUrl,
        project.id,
        mrNumber,
        rejectionMessage,
        credentials.accessToken
      );
    }
  }

  return {
    success: true,
    message: "Claim rejected: MR closed without merge",
  };
}
