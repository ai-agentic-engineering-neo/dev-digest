/* Mirrors of the shared intent enums. Types come from @devdigest/shared, but
   runtime values must not be imported from it in client code (the barrel
   breaks the dev server), so the values live here. */

export const CONFIDENCE_META = {
  high: { color: "var(--ok)", bg: "var(--ok-bg, var(--bg-hover))" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
} as const;

export const STATUS_META = {
  used: { color: "var(--ok)", bg: "var(--ok-bg, var(--bg-hover))" },
  truncated: { color: "var(--warn)", bg: "var(--warn-bg)" },
  skipped: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const;

/** Reason codes that have a translated label under `intent.reason.*`. */
export const KNOWN_REASONS: ReadonlySet<string> = new Set([
  "external_fetch_disabled",
  "no_ticket_provider",
  "no_github_token",
  "github_unavailable",
  "not_found_or_no_access",
  "not_found_at_head",
  "cross_owner",
  "cross_repo",
  "extension_not_allowed",
  "invalid_path",
  "not_imported",
  "empty",
]);

/** Source kinds whose `ref` is a repo-relative path or an issue number we can link. */
export const LINKABLE_KINDS: ReadonlySet<string> = new Set(["github_issue", "repo_doc"]);

/** The "basic" sources (title, branch…) that are always present; shown compactly. */
export const BASIC_KINDS: ReadonlySet<string> = new Set(["title", "body", "branch", "commits", "files"]);
