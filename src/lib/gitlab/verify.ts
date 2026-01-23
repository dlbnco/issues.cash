/**
 * GitLab Webhook Verification
 *
 * GitLab uses a simpler token-based verification compared to GitHub's HMAC.
 * The X-Gitlab-Token header contains the secret token configured in the webhook.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { parseWebhookCredentials } from "@/lib/webhooks/types";

export interface GitLabCredentials {
  secret: string;
  accessToken: string | null;
  projectId: string | null; // Database ID of GitLabProject
}

/**
 * Verify GitLab webhook token using constant-time comparison
 */
export function verifyGitLabToken(
  receivedToken: string,
  expectedSecret: string
): boolean {
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedToken),
      Buffer.from(expectedSecret)
    );
  } catch {
    // Buffers of different lengths will throw
    return false;
  }
}

/**
 * TOFU (Trust-On-First-Use) credential verification
 *
 * - If project exists: verify the token matches stored secret
 * - If project doesn't exist: register it with the provided credentials
 *
 * @param projectId - GitLab numeric project ID
 * @param pathWithNamespace - Project path (e.g., "myorg/myrepo")
 * @param instanceUrl - GitLab instance URL (e.g., "https://gitlab.com")
 * @param receivedToken - Token from X-Gitlab-Token header (format: "secret|token" or just "secret")
 * @returns Credentials if valid, null if invalid
 */
export async function verifyOrRegisterProject(
  projectId: number,
  pathWithNamespace: string,
  instanceUrl: string,
  receivedToken: string
): Promise<GitLabCredentials | null> {
  // Parse the received token into secret and optional access token
  const { secret, token } = parseWebhookCredentials(receivedToken);

  // Look up existing project
  const existingProject = await prisma.gitLabProject.findUnique({
    where: {
      projectId_instanceUrl: {
        projectId,
        instanceUrl,
      },
    },
  });

  if (existingProject) {
    // Verify token matches stored secret
    if (!verifyGitLabToken(secret, existingProject.webhookSecret)) {
      console.error(
        `Invalid webhook secret for GitLab project ${pathWithNamespace}`
      );
      return null;
    }

    return {
      secret: existingProject.webhookSecret,
      accessToken: existingProject.accessToken,
      projectId: existingProject.id,
    };
  }

  // First time seeing this project - register it (TOFU)
  console.log(
    `📝 Registering new GitLab project: ${pathWithNamespace} (${instanceUrl})`
  );

  const newProject = await prisma.gitLabProject.create({
    data: {
      projectId,
      pathWithNamespace,
      instanceUrl,
      webhookSecret: secret,
      accessToken: token,
    },
  });

  return {
    secret: newProject.webhookSecret,
    accessToken: newProject.accessToken,
    projectId: newProject.id,
  };
}

/**
 * Get GitLabProject credentials by database ID
 */
export async function getProjectCredentials(
  gitlabProjectId: string
): Promise<GitLabCredentials | null> {
  const project = await prisma.gitLabProject.findUnique({
    where: { id: gitlabProjectId },
  });

  if (!project) {
    return null;
  }

  return {
    secret: project.webhookSecret,
    accessToken: project.accessToken,
    projectId: project.id,
  };
}
