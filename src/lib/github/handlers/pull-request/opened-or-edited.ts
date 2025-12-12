import type {
  PullRequestOpenedEvent,
  PullRequestEditedEvent,
  PullRequestReopenedEvent,
} from "@octokit/webhooks-types";
import {
  getMostRecentBountyByIssueNumber,
  updateBountyComments,
} from "@/lib/bounty";
import { createOrUpdateAttempt } from "@/lib/attempt";
import { parseClaimCommand } from "@/lib/commands";
import { parseRepoFullName, postPRComment } from "@/lib/github/api";
import * as messages from "@/lib/messages";
import { AttemptStatus } from "@prisma/client";
import type { WebhookResponse } from "../types";

/**
 * Handle pull request opened/edited/reopened events
 * Detects /claim commands in PR body
 */
export async function handlePullRequestOpenedOrEdited(
  payload:
    | PullRequestOpenedEvent
    | PullRequestEditedEvent
    | PullRequestReopenedEvent,
): Promise<WebhookResponse> {
  const { action, pull_request, repository } = payload;

  // Only handle opened, edited, and reopened actions
  if (action !== "opened" && action !== "edited" && action !== "reopened") {
    return { success: true, message: "Ignored: not opened or edited" };
  }

  const prBody = pull_request.body?.trim() || "";
  const prNumber = pull_request.number;
  const prUrl = pull_request.html_url;
  const contributorLogin = pull_request.user?.login ?? "unknown";
  const repoFullName = repository.full_name;

  // Check if PR body contains a /claim command
  if (!prBody.includes("/claim")) {
    return { success: true, message: "Ignored: no /claim command found" };
  }

  // Parse the claim command
  const claimCommand = parseClaimCommand(prBody);
  const { owner, repo } = parseRepoFullName(repoFullName);
  const installationId =
    "installation" in payload ? payload.installation?.id : undefined;

  if (!claimCommand.success) {
    // Post error message to PR
    await postPRComment(
      owner,
      repo,
      prNumber,
      messages.invalidClaimCommandError(claimCommand.error!),
      installationId,
    );

    return {
      success: false,
      error: claimCommand.error,
    };
  }

  // Find the bounty for the claimed issue
  const bounty = await getMostRecentBountyByIssueNumber(
    repoFullName,
    claimCommand.issueNumber!,
  );

  if (!bounty) {
    // Post error message to PR
    await postPRComment(
      owner,
      repo,
      prNumber,
      messages.noBountyFoundError(claimCommand.issueNumber!),
      installationId,
    );

    return {
      success: false,
      error: `No bounty found for issue #${claimCommand.issueNumber}`,
    };
  }

  // Check if bounty is active (funded)
  if (bounty.status !== "ACTIVE") {
    // Post error message to PR
    await postPRComment(
      owner,
      repo,
      prNumber,
      messages.bountyNotActiveError(
        claimCommand.issueNumber!,
        bounty.status,
        bounty.contractAddress,
      ),
      installationId,
    );

    return {
      success: false,
      error: `Bounty is not active (status: ${bounty.status})`,
    };
  }

  // Create or update the attempt
  try {
    await createOrUpdateAttempt({
      bountyId: bounty.id,
      prNumber,
      prUrl,
      contributorLogin,
      contributorAddress: claimCommand.contributorAddress!,
      status: AttemptStatus.PENDING,
    });

    await updateBountyComments(bounty.id);

    return {
      success: true,
      message: "Claim registered successfully",
    };
  } catch (error) {
    console.error("Error creating attempt:", error);

    // Post error message to PR
    await postPRComment(
      owner,
      repo,
      prNumber,
      messages.claimRegistrationError((error as Error).message),
      installationId,
    );

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
