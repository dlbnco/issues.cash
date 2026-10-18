/**
 * Shared types for webhook handlers across platforms (GitHub, GitLab)
 */

export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  bounty?: {
    id: string;
    contractAddress: string;
    amount: number;
  };
}

/**
 * Result of parsing webhook credentials (for GitLab TOFU)
 */
export interface ParsedCredentials {
  secret: string;
  token: string | null;
}

/**
 * Parse GitLab webhook secret format: "secret|token" or just "secret"
 */
export function parseWebhookCredentials(combined: string): ParsedCredentials {
  const pipeIndex = combined.indexOf("|");
  if (pipeIndex === -1) {
    return { secret: combined, token: null };
  }
  return {
    secret: combined.substring(0, pipeIndex),
    token: combined.substring(pipeIndex + 1) || null,
  };
}
