import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { BCH_NETWORK_ENV_VAR_NAME, DEFAULT_BCH_NETWORK } from "../constants";
import { Network } from "cashscript";

/**
 * Get Octokit client instance for GitHub App authentication
 *
 * @param installationId - The installation ID from the webhook payload
 */
function getOctokitForApp(installationId: number): Octokit | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!appId || !privateKey) {
    console.warn("⚠️  GITHUB_APP_ID or GITHUB_PRIVATE_KEY not configured");
    return null;
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}

/**
 * Get Octokit client instance with Personal Access Token
 * Fallback if GitHub App is not configured
 */
function getOctokitWithToken(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn("⚠️  GITHUB_TOKEN not configured");
    return null;
  }

  return new Octokit({ auth: token });
}

/**
 * Get Octokit client - prefers GitHub App, falls back to PAT
 *
 * @param installationId - Optional installation ID for GitHub App auth
 */
function getOctokit(installationId?: number): Octokit | null {
  // Try GitHub App authentication first if installationId provided
  if (installationId) {
    const appClient = getOctokitForApp(installationId);
    if (appClient) return appClient;
  }

  // Fallback to Personal Access Token
  return getOctokitWithToken();
}

export async function getRepoBchNetwork(
  owner: string,
  repo: string,
  installationId: number,
): Promise<Network> {
  const octokit = getOctokit(installationId);

  if (!octokit) {
    throw new Error("Could not get octokit");
  }

  try {
    const result = await octokit.rest.actions.getRepoVariable({
      repo,
      owner,
      name: BCH_NETWORK_ENV_VAR_NAME,
    });

    return result.data.value as Network;
  } catch (error) {
    console.error("Failed to get GitHub repo variables:", error);
    return DEFAULT_BCH_NETWORK;
  }
}

/**
 * Post a comment on an issue
 */
export async function postIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  installationId?: number,
): Promise<number | undefined> {
  const octokit = getOctokit(installationId);

  if (!octokit) {
    console.error("Cannot post comment: GitHub authentication not configured");
    return undefined;
  }

  try {
    const result = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    console.log(`✅ Posted comment to ${owner}/${repo}#${issueNumber}`);
    return result.data.id;
  } catch (error) {
    console.error("Failed to post GitHub comment:", error);
    return undefined;
  }
}

/**
 * Update an existing issue comment
 */
export async function updateIssueComment(
  owner: string,
  repo: string,
  commentId: bigint,
  body: string,
  installationId?: number,
): Promise<boolean> {
  const octokit = getOctokit(installationId);

  if (!octokit) {
    console.error(
      "Cannot update comment: GitHub authentication not configured",
    );
    return false;
  }

  try {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: Number(commentId),
      body,
    });

    console.log(`✅ Updated comment ${commentId} in ${owner}/${repo}`);
    return true;
  } catch (error) {
    console.error("Failed to update GitHub comment:", error);
    return false;
  }
}

/**
 * Post a comment on a pull request
 */
export async function postPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  installationId?: number,
): Promise<number | undefined> {
  // PRs are issues in GitHub's API, so we can use the same method
  return postIssueComment(owner, repo, prNumber, body, installationId);
}

/**
 * Add a label to an issue
 */
export async function addIssueLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
  installationId?: number,
): Promise<boolean> {
  const octokit = getOctokit(installationId);

  if (!octokit) {
    console.error("Cannot add label: GitHub authentication not configured");
    return false;
  }

  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [label],
    });

    console.log(`✅ Added label "${label}" to ${owner}/${repo}#${issueNumber}`);
    return true;
  } catch (error) {
    console.error("Failed to add GitHub label:", error);
    return false;
  }
}

/**
 * Create or update a comment on an issue/PR
 * If the app already has a comment, it updates it; otherwise creates a new one
 */
export async function createOrUpdateComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  commentId?: bigint | null,
  installationId?: number,
): Promise<bigint | number | undefined> {
  if (commentId) {
    // Update existing comment
    const success = await updateIssueComment(
      owner,
      repo,
      commentId,
      body,
      installationId,
    );
    return success ? commentId : undefined;
  } else {
    // Create new comment
    return await postIssueComment(
      owner,
      repo,
      issueNumber,
      body,
      installationId,
    );
  }
}

/**
 * Delete an issue comment
 */
export async function deleteIssueComment(
  owner: string,
  repo: string,
  commentId: bigint,
  installationId?: number,
): Promise<boolean> {
  const octokit = getOctokit(installationId);

  if (!octokit) {
    console.error(
      "Cannot delete comment: GitHub authentication not configured",
    );
    return false;
  }

  try {
    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: Number(commentId),
    });

    console.log(`✅ Deleted comment ${commentId} in ${owner}/${repo}`);
    return true;
  } catch (error) {
    console.error("Failed to delete GitHub comment:", error);
    return false;
  }
}

/**
 * Parse repository full name into owner and repo
 */
export function parseRepoFullName(fullName: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}
