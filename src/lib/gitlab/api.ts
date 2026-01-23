/**
 * GitLab API client for issues.cash
 *
 * Uses project/group access tokens provided via the TOFU credential system.
 * Each project stores its own access token in the GitLabProject table.
 */

import { Network } from "cashscript";
import { BCH_NETWORK_ENV_VAR_NAME, DEFAULT_BCH_NETWORK } from "../constants";

const DEFAULT_GITLAB_INSTANCE = "https://gitlab.com";

interface GitLabApiConfig {
  instanceUrl: string;
  accessToken: string;
}

/**
 * Make an authenticated GitLab API request
 */
async function gitlabFetch<T>(
  config: GitLabApiConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.instanceUrl}/api/v4${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": config.accessToken,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitLab API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Get BCH network from project CI/CD variables
 */
export async function getProjectBchNetwork(
  instanceUrl: string,
  projectId: number,
  accessToken: string
): Promise<Network> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    const result = await gitlabFetch<{ value: string }>(
      config,
      `/projects/${projectId}/variables/${BCH_NETWORK_ENV_VAR_NAME}`
    );
    return result.value as Network;
  } catch (error) {
    console.warn(
      `Could not get ${BCH_NETWORK_ENV_VAR_NAME} from GitLab project ${projectId}, using default:`,
      error
    );
    return DEFAULT_BCH_NETWORK;
  }
}

/**
 * Post a note (comment) on an issue
 */
export async function postIssueNote(
  instanceUrl: string,
  projectId: number,
  issueIid: number,
  body: string,
  accessToken: string
): Promise<number | undefined> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    const result = await gitlabFetch<{ id: number }>(
      config,
      `/projects/${projectId}/issues/${issueIid}/notes`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      }
    );

    console.log(
      `✅ Posted note to GitLab project ${projectId} issue #${issueIid}`
    );
    return result.id;
  } catch (error) {
    console.error("Failed to post GitLab note:", error);
    return undefined;
  }
}

/**
 * Update an existing note on an issue
 */
export async function updateIssueNote(
  instanceUrl: string,
  projectId: number,
  issueIid: number,
  noteId: bigint,
  body: string,
  accessToken: string
): Promise<boolean> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    await gitlabFetch(
      config,
      `/projects/${projectId}/issues/${issueIid}/notes/${noteId}`,
      {
        method: "PUT",
        body: JSON.stringify({ body }),
      }
    );

    console.log(
      `✅ Updated note ${noteId} in GitLab project ${projectId} issue #${issueIid}`
    );
    return true;
  } catch (error) {
    console.error("Failed to update GitLab note:", error);
    return false;
  }
}

/**
 * Post a note on a merge request
 */
export async function postMergeRequestNote(
  instanceUrl: string,
  projectId: number,
  mrIid: number,
  body: string,
  accessToken: string
): Promise<number | undefined> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    const result = await gitlabFetch<{ id: number }>(
      config,
      `/projects/${projectId}/merge_requests/${mrIid}/notes`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      }
    );

    console.log(`✅ Posted note to GitLab project ${projectId} MR !${mrIid}`);
    return result.id;
  } catch (error) {
    console.error("Failed to post GitLab MR note:", error);
    return undefined;
  }
}

/**
 * Update an existing note on a merge request
 */
export async function updateMergeRequestNote(
  instanceUrl: string,
  projectId: number,
  mrIid: number,
  noteId: bigint,
  body: string,
  accessToken: string
): Promise<boolean> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    await gitlabFetch(
      config,
      `/projects/${projectId}/merge_requests/${mrIid}/notes/${noteId}`,
      {
        method: "PUT",
        body: JSON.stringify({ body }),
      }
    );

    console.log(
      `✅ Updated MR note ${noteId} in GitLab project ${projectId} MR !${mrIid}`
    );
    return true;
  } catch (error) {
    console.error("Failed to update GitLab MR note:", error);
    return false;
  }
}

/**
 * Add labels to an issue
 */
export async function addIssueLabels(
  instanceUrl: string,
  projectId: number,
  issueIid: number,
  labels: string[],
  accessToken: string
): Promise<boolean> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    await gitlabFetch(config, `/projects/${projectId}/issues/${issueIid}`, {
      method: "PUT",
      body: JSON.stringify({ add_labels: labels.join(",") }),
    });

    console.log(
      `✅ Added labels [${labels.join(", ")}] to GitLab project ${projectId} issue #${issueIid}`
    );
    return true;
  } catch (error) {
    console.error("Failed to add GitLab labels:", error);
    return false;
  }
}

/**
 * Check user's access level in a project
 * Returns access_level: 10=Guest, 20=Reporter, 30=Developer, 40=Maintainer, 50=Owner
 */
export async function getUserAccessLevel(
  instanceUrl: string,
  projectId: number,
  userId: number,
  accessToken: string
): Promise<number | null> {
  const config: GitLabApiConfig = {
    instanceUrl: instanceUrl || DEFAULT_GITLAB_INSTANCE,
    accessToken,
  };

  try {
    const result = await gitlabFetch<{ access_level: number }>(
      config,
      `/projects/${projectId}/members/all/${userId}`
    );
    return result.access_level;
  } catch (error) {
    // User might not be a direct member - check if they're a project owner
    console.warn(
      `Could not get access level for user ${userId} in project ${projectId}:`,
      error
    );
    return null;
  }
}

/**
 * Check if user is a maintainer (access_level >= 40)
 */
export async function isUserMaintainer(
  instanceUrl: string,
  projectId: number,
  userId: number,
  accessToken: string
): Promise<boolean> {
  const accessLevel = await getUserAccessLevel(
    instanceUrl,
    projectId,
    userId,
    accessToken
  );
  return accessLevel !== null && accessLevel >= 40;
}

/**
 * Create or update a note on an issue
 */
export async function createOrUpdateIssueNote(
  instanceUrl: string,
  projectId: number,
  issueIid: number,
  body: string,
  noteId: bigint | null | undefined,
  accessToken: string
): Promise<bigint | number | undefined> {
  if (noteId) {
    const success = await updateIssueNote(
      instanceUrl,
      projectId,
      issueIid,
      noteId,
      body,
      accessToken
    );
    return success ? noteId : undefined;
  } else {
    return await postIssueNote(
      instanceUrl,
      projectId,
      issueIid,
      body,
      accessToken
    );
  }
}

/**
 * Create or update a note on a merge request
 */
export async function createOrUpdateMergeRequestNote(
  instanceUrl: string,
  projectId: number,
  mrIid: number,
  body: string,
  noteId: bigint | null | undefined,
  accessToken: string
): Promise<bigint | number | undefined> {
  if (noteId) {
    const success = await updateMergeRequestNote(
      instanceUrl,
      projectId,
      mrIid,
      noteId,
      body,
      accessToken
    );
    return success ? noteId : undefined;
  } else {
    return await postMergeRequestNote(
      instanceUrl,
      projectId,
      mrIid,
      body,
      accessToken
    );
  }
}

/**
 * Parse GitLab project path_with_namespace into owner and name
 * e.g., "myorg/myrepo" -> { owner: "myorg", name: "myrepo" }
 * e.g., "myorg/subgroup/myrepo" -> { owner: "myorg/subgroup", name: "myrepo" }
 */
export function parsePathWithNamespace(pathWithNamespace: string): {
  owner: string;
  name: string;
} {
  const lastSlashIndex = pathWithNamespace.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { owner: "", name: pathWithNamespace };
  }
  return {
    owner: pathWithNamespace.substring(0, lastSlashIndex),
    name: pathWithNamespace.substring(lastSlashIndex + 1),
  };
}

/**
 * Construct issue URL from project web_url and issue IID
 */
export function constructIssueUrl(projectWebUrl: string, issueIid: number): string {
  return `${projectWebUrl}/-/issues/${issueIid}`;
}

/**
 * Construct merge request URL from project web_url and MR IID
 */
export function constructMergeRequestUrl(
  projectWebUrl: string,
  mrIid: number
): string {
  return `${projectWebUrl}/-/merge_requests/${mrIid}`;
}

/**
 * Extract instance URL from project web_url
 * e.g., "https://gitlab.com/myorg/myrepo" -> "https://gitlab.com"
 * e.g., "https://gitlab.mycompany.com/myorg/myrepo" -> "https://gitlab.mycompany.com"
 */
export function extractInstanceUrl(projectWebUrl: string): string {
  try {
    const url = new URL(projectWebUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_GITLAB_INSTANCE;
  }
}
