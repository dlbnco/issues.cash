/**
 * GitLab Webhook Types
 *
 * Extends types from gitlab-event-types package with stricter definitions
 * for fields that are always present in webhook payloads.
 *
 * See: https://github.com/lawvs/gitlab-event-types
 */

import type {
  WebhookEvents as BaseWebhookEvents,
  CommentEvent as BaseCommentEvent,
  IssueEvent as BaseIssueEvent,
  MergeRequestEvent as BaseMergeRequestEvent,
  Project as BaseProject,
  Issue as BaseIssue,
} from "gitlab-event-types";

// Re-export types that don't need modification
export type {
  NoteAttributes,
  IssueAttributes,
  MergeRequestAttributes,
  Repository,
  User,
  Label,
} from "gitlab-event-types";

// Stricter Project type - id is always present in webhook payloads
export interface Project extends Omit<BaseProject, "id"> {
  id: number;
}

// Stricter Issue type for note events - iid is always present
export interface Issue extends Omit<BaseIssue, "iid"> {
  iid: number;
}

// Stricter CommentEvent with required project.id
export interface CommentEvent extends Omit<BaseCommentEvent, "project" | "issue"> {
  project: Project;
  issue?: Issue;
  merge_request?: BaseCommentEvent["merge_request"];
}

// Stricter IssueEvent with required project.id
export interface IssueEvent extends Omit<BaseIssueEvent, "project"> {
  project: Project;
}

// Stricter MergeRequestEvent with required project.id
export interface MergeRequestEvent extends Omit<BaseMergeRequestEvent, "project"> {
  project: Project;
}

// Union of webhook events we handle
export type WebhookEvents = CommentEvent | IssueEvent | MergeRequestEvent;

// Backwards-compatible aliases
export type GitLabNoteEvent = CommentEvent;
export type GitLabIssueEvent = IssueEvent;
export type GitLabMergeRequestEvent = MergeRequestEvent;
export type GitLabWebhookEvent = WebhookEvents;

// Type guards

export function isNoteEvent(event: BaseWebhookEvents): event is CommentEvent {
  return "object_kind" in event && event.object_kind === "note";
}

export function isIssueEvent(event: BaseWebhookEvents): event is IssueEvent {
  return "object_kind" in event && event.object_kind === "issue";
}

export function isMergeRequestEvent(
  event: BaseWebhookEvents
): event is MergeRequestEvent {
  return "object_kind" in event && event.object_kind === "merge_request";
}

export function isNoteOnIssue(
  event: CommentEvent
): event is CommentEvent & { issue: Issue } {
  return (
    event.object_attributes.noteable_type === "Issue" && event.issue !== undefined
  );
}

export function isNoteOnMergeRequest(
  event: CommentEvent
): event is CommentEvent & { merge_request: NonNullable<CommentEvent["merge_request"]> } {
  return (
    event.object_attributes.noteable_type === "MergeRequest" &&
    event.merge_request !== undefined
  );
}
