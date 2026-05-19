import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type {
  IssueCommentCreatedEvent,
  PullRequestClosedEvent,
  PullRequestOpenedEvent,
  PullRequestEditedEvent,
  IssuesClosedEvent,
  IssuesOpenedEvent,
  IssueCommentDeletedEvent,
  PullRequestReopenedEvent,
} from "@octokit/webhooks-types";
import type { WebhookResponse } from "@/lib/github/handlers/types";
import { handleIssueComment } from "@/lib/github/handlers/issue/comment";
import { handleIssueClosed } from "@/lib/github/handlers/issue/closed";
import { handlePullRequestOpenedOrEdited } from "@/lib/github/handlers/pull-request/opened-or-edited";
import { handlePullRequestClosed } from "@/lib/github/handlers/pull-request/closed";
import { logger } from "@/lib/logger";

/**
 * Verify GitHub webhook signature
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

    // Verify webhook signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("GITHUB_WEBHOOK_SECRET not configured", { provider: "github" });
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    if (
      process.env.NODE_ENV !== "development" &&
      !verifyGitHubSignature(payload, signature, webhookSecret)
    ) {
      logger.warn("Invalid webhook signature", { provider: "github", event });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the payload
    const data = JSON.parse(payload) as
      | IssueCommentCreatedEvent
      | IssueCommentDeletedEvent
      | PullRequestClosedEvent
      | PullRequestOpenedEvent
      | PullRequestEditedEvent
      | IssuesClosedEvent
      | IssuesOpenedEvent;

    // Log the event
    logger.info("GitHub webhook received", { provider: "github", event });

    // Route to appropriate handler
    let result: WebhookResponse;
    switch (event) {
      case "issue_comment":
        result = await handleIssueComment(
          data as IssueCommentCreatedEvent | IssueCommentDeletedEvent,
        );
        break;

      case "pull_request":
        const prPayload = data as
          | PullRequestOpenedEvent
          | PullRequestReopenedEvent
          | PullRequestEditedEvent
          | PullRequestClosedEvent;

        const prAction = prPayload.action;

        switch (prAction) {
          case "opened":
          case "edited":
          case "reopened":
            result = await handlePullRequestOpenedOrEdited(
              prPayload as
                | PullRequestOpenedEvent
                | PullRequestEditedEvent
                | PullRequestReopenedEvent,
            );
            break;
          case "closed":
            result = await handlePullRequestClosed(
              prPayload as PullRequestClosedEvent,
            );
            break;
          default:
            result = {
              success: true,
              message: `Ignored PR action: ${prAction}`,
            };
            break;
        }
        break;

      case "issues":
        result = await handleIssueClosed(data as IssuesClosedEvent);
        break;

      case "ping":
        return NextResponse.json({
          success: true,
          message: "Pong! Webhook is configured correctly.",
        });

      default:
        return NextResponse.json({
          success: true,
          message: `Ignored event: ${event}`,
        });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("GitHub webhook error", {
      provider: "github",
      error: (error as Error).message,
    });
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

// Disable body parsing to get raw body for signature verification
export const runtime = "nodejs";
