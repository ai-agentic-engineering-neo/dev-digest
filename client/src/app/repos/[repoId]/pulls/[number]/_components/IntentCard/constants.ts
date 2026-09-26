import type { IntentConfidence, IntentSourceKind } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Confidence badge dot color. */
export const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

/** Source badge icon by kind. */
export const KIND_ICON: Record<IntentSourceKind, IconName> = {
  title: "Hash",
  description: "MessageSquare",
  branch: "GitBranch",
  commits: "GitCommit",
  changed_paths: "Folder",
  linked_issue: "Tag",
  linked_spec: "FileText",
  spec_in_diff: "FileText",
  external_link: "Globe",
};
