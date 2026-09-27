import type { IconName } from "@devdigest/ui";
import type { IntentRiskKind, IntentSourceKind, IntentSourceRef } from "@devdigest/shared";

/** Icon per risk kind (all exist in the vendored icon set). */
export const RISK_ICON: Record<IntentRiskKind, IconName> = {
  security: "Shield",
  data: "Database",
  performance: "Gauge",
  compatibility: "GitMerge",
  behavior: "Activity",
  other: "Info",
};

/** Wire enum (snake_case) -> camelCase i18n key: the one place they are mapped. */
export const SOURCE_KIND_KEY: Record<IntentSourceKind, string> = {
  description: "description",
  linked_issue: "linkedIssue",
  plan_spec: "planSpec",
  commits: "commits",
  branch: "branch",
  file_paths: "filePaths",
};

export const SOURCE_STATUS_KEY: Record<IntentSourceRef["status"], string> = {
  used: "used",
  unreadable: "unreadable",
  skipped_external: "skippedExternal",
  unresolved: "unresolved",
};
