import { NextRequest, NextResponse } from "next/server";
import type {
  GitLabWebhookEvent,
  GitLabNoteEvent,
  GitLabIssueEvent,
  GitLabMergeRequestEvent,
} from "@/lib/gitlab/types";
import {
  isNoteEvent,
  isIssueEvent,
  isMergeRequestEvent,
  isNoteOnIssue,
} from "@/lib/gitlab/types";
import type { WebhookResponse } from "@/lib/webhooks/types";
import { verifyOrRegisterProject } from "@/lib/gitlab/verify";
import { extractInstanceUrl } from "@/lib/gitlab/api";
import { handleNoteOnIssue } from "@/lib/gitlab/handlers/note";
import { handleIssueClosed } from "@/lib/gitlab/handlers/issue";
import { handleMergeRequest } from "@/lib/gitlab/handlers/merge-request";

/**
 * GitLab Webhook Handler
 *
 * Receives webhooks from GitLab projects and routes them to appropriate handlers.
 * Uses TOFU (Trust-On-First-Use) for per-project credential management.
 *
 * Webhook secret format: "secret|token" or just "secret"
 * - secret: Used for webhook verification
 * - token: Optional GitLab access token for posting comments
 */
export async function POST(request: NextRequest) {
  try {
    // Get the raw body
    const payload = await request.text();
    const token = request.headers.get("x-gitlab-token");
    const event = request.headers.get("x-gitlab-event");

    // Check for token
    if (!token) {
      console.error("Missing X-Gitlab-Token header");
      return NextResponse.json(
        { error: "Missing webhook token" },
        { status: 401 }
      );
    }

    // Parse the payload
    let data: GitLabWebhookEvent;
    try {
      data = JSON.parse(payload) as GitLabWebhookEvent;
    } catch {
      console.error("Invalid JSON payload");
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // Extract project info from payload
    const project = data.project;
    if (!project) {
      console.error("Missing project in webhook payload");
      return NextResponse.json(
        { error: "Missing project information" },
        { status: 400 }
      );
    }

    const instanceUrl = extractInstanceUrl(project.web_url);

    // TOFU verification - verify token or register new project
    const credentials = await verifyOrRegisterProject(
      project.id,
      project.path_with_namespace,
      instanceUrl,
      token
    );

    if (!credentials) {
      console.error(
        `Invalid webhook token for project ${project.path_with_namespace}`
      );
      return NextResponse.json(
        { error: "Invalid webhook token" },
        { status: 401 }
      );
    }

    // Log the event
    console.log(
      `📨 GitLab webhook: ${event} from ${project.path_with_namespace}`
    );

    // Route to appropriate handler
    let result: WebhookResponse;

    if (isNoteEvent(data)) {
      // Note (comment) event
      if (isNoteOnIssue(data)) {
        result = await handleNoteOnIssue(data, credentials);
      } else {
        result = {
          success: true,
          message: `Ignored note on ${data.object_attributes.noteable_type}`,
        };
      }
    } else if (isIssueEvent(data)) {
      // Issue event
      result = await handleIssueClosed(data, credentials);
    } else if (isMergeRequestEvent(data)) {
      // Merge request event
      result = await handleMergeRequest(data, credentials);
    } else {
      // Unknown event type
      result = {
        success: true,
        message: `Ignored event: ${event}`,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("GitLab webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// Disable body parsing to get raw body for token verification
export const runtime = "nodejs";
