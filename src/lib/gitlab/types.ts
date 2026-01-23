/**
 * GitLab Webhook Payload Types
 * Based on https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html
 */

// Common types shared across payloads

export interface GitLabUser {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  description: string;
  web_url: string;
  avatar_url: string | null;
  git_ssh_url: string;
  git_http_url: string;
  namespace: string;
  visibility_level: number;
  path_with_namespace: string;
  default_branch: string;
  ci_config_path: string | null;
  homepage: string;
  url: string;
  ssh_url: string;
  http_url: string;
}

export interface GitLabRepository {
  name: string;
  url: string;
  description: string;
  homepage: string;
}

export interface GitLabLabel {
  id: number;
  title: string;
  color: string;
  project_id: number | null;
  created_at: string;
  updated_at: string;
  template: boolean;
  description: string | null;
  type: "ProjectLabel" | "GroupLabel";
  group_id: number | null;
}

// Issue types

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  assignee_ids: number[];
  assignee_id: number | null;
  author_id: number;
  project_id: number;
  created_at: string;
  updated_at: string;
  position: number;
  branch_name: string | null;
  description: string;
  milestone_id: number | null;
  state: "opened" | "closed";
  labels: GitLabLabel[];
}

// Note (Comment) types

export interface GitLabNoteAttributes {
  id: number;
  note: string;
  noteable_type: "Issue" | "MergeRequest" | "Commit" | "Snippet";
  author_id: number;
  created_at: string;
  updated_at: string;
  project_id: number;
  attachment: string | null;
  line_code: string | null;
  commit_id: string;
  noteable_id: number;
  system: boolean;
  st_diff: unknown | null;
  action: "create" | "update";
  url: string;
  internal: boolean;
}

// Merge Request types

export interface GitLabMergeRequestAttributes {
  id: number;
  iid: number;
  target_branch: string;
  source_branch: string;
  source_project_id: number;
  author_id: number;
  assignee_id: number | null;
  assignee_ids: number[];
  title: string;
  created_at: string;
  updated_at: string;
  milestone_id: number | null;
  state: "opened" | "closed" | "merged";
  merge_status: string;
  target_project_id: number;
  description: string;
  url: string;
  action:
    | "open"
    | "close"
    | "reopen"
    | "update"
    | "approval"
    | "approved"
    | "unapproval"
    | "unapproved"
    | "merge";
  labels: GitLabLabel[];
  last_commit: {
    id: string;
    message: string;
    title: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
  };
  work_in_progress: boolean;
  draft: boolean;
  detailed_merge_status: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  target_branch: string;
  source_branch: string;
  source_project_id: number;
  author_id: number;
  assignee_id: number | null;
  title: string;
  created_at: string;
  updated_at: string;
  milestone_id: number | null;
  state: "opened" | "closed" | "merged";
  merge_status: string;
  target_project_id: number;
  description: string;
  labels: GitLabLabel[];
}

// Issue attributes for issue events

export interface GitLabIssueAttributes {
  id: number;
  iid: number;
  title: string;
  assignee_ids: number[];
  assignee_id: number | null;
  author_id: number;
  project_id: number;
  created_at: string;
  updated_at: string;
  updated_by_id: number | null;
  last_edited_at: string | null;
  last_edited_by_id: number | null;
  relative_position: number;
  description: string;
  milestone_id: number | null;
  state_id: number;
  confidential: boolean;
  discussion_locked: boolean;
  due_date: string | null;
  moved_to_id: number | null;
  duplicated_to_id: number | null;
  time_estimate: number;
  total_time_spent: number;
  human_total_time_spent: string | null;
  human_time_estimate: string | null;
  weight: number | null;
  health_status: string | null;
  type: string;
  url: string;
  state: "opened" | "closed";
  action: "open" | "close" | "reopen" | "update";
  labels: GitLabLabel[];
}

// Webhook Event Payloads

/**
 * Note Hook - Triggered when a comment is made on issues, MRs, commits, or snippets
 * X-Gitlab-Event: Note Hook
 */
export interface GitLabNoteEvent {
  object_kind: "note";
  event_type: "note" | "confidential_note";
  user: GitLabUser;
  project_id: number;
  project: GitLabProject;
  repository: GitLabRepository;
  object_attributes: GitLabNoteAttributes;
  // Present when comment is on an issue
  issue?: GitLabIssue;
  // Present when comment is on a merge request
  merge_request?: GitLabMergeRequest;
}

/**
 * Issue Hook - Triggered when an issue is created, updated, closed, or reopened
 * X-Gitlab-Event: Issue Hook
 */
export interface GitLabIssueEvent {
  object_kind: "issue";
  event_type: "issue";
  user: GitLabUser;
  project: GitLabProject;
  repository: GitLabRepository;
  object_attributes: GitLabIssueAttributes;
  labels: GitLabLabel[];
  changes: Record<
    string,
    {
      previous: unknown;
      current: unknown;
    }
  >;
  assignees: GitLabUser[];
}

/**
 * Merge Request Hook - Triggered when a MR is created, updated, merged, or closed
 * X-Gitlab-Event: Merge Request Hook
 */
export interface GitLabMergeRequestEvent {
  object_kind: "merge_request";
  event_type: "merge_request";
  user: GitLabUser;
  project: GitLabProject;
  repository: GitLabRepository;
  object_attributes: GitLabMergeRequestAttributes;
  labels: GitLabLabel[];
  changes: Record<
    string,
    {
      previous: unknown;
      current: unknown;
    }
  >;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
}

// Union type for all supported webhook events
export type GitLabWebhookEvent =
  | GitLabNoteEvent
  | GitLabIssueEvent
  | GitLabMergeRequestEvent;

// Event type guards

export function isNoteEvent(event: GitLabWebhookEvent): event is GitLabNoteEvent {
  return event.object_kind === "note";
}

export function isIssueEvent(event: GitLabWebhookEvent): event is GitLabIssueEvent {
  return event.object_kind === "issue";
}

export function isMergeRequestEvent(
  event: GitLabWebhookEvent
): event is GitLabMergeRequestEvent {
  return event.object_kind === "merge_request";
}

export function isNoteOnIssue(
  event: GitLabNoteEvent
): event is GitLabNoteEvent & { issue: GitLabIssue } {
  return (
    event.object_attributes.noteable_type === "Issue" && event.issue !== undefined
  );
}

export function isNoteOnMergeRequest(
  event: GitLabNoteEvent
): event is GitLabNoteEvent & { merge_request: GitLabMergeRequest } {
  return (
    event.object_attributes.noteable_type === "MergeRequest" &&
    event.merge_request !== undefined
  );
}
