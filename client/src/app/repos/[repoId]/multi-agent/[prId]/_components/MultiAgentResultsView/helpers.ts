import type { IconName } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";

// D21's derived visual identity ({color, icon} from an agent id) now lives in
// `@/lib/agent-identity` — promoted out of this route-private module once
// `MultiAgentConfigureView` (a sibling route) became its second consumer.
// Import `agentIdentity`/`AgentIdentity` from there, not from here.

/** Seconds-formatted duration, e.g. "8.2s". Deliberately NOT imported from
 *  `RunTraceDrawer/helpers.ts` (that file is colocated to a different
 *  component) — this is the same one-line formula, not a shared module. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * AC-38, D-P1 — a column PARTICIPATES in conflict comparison only once it has
 * actually finished (`status === 'done'`); a failed, cancelled or still-running
 * agent is never treated as "did not flag" (server-side rule, mirrored here
 * only for the client's OWN "how many participants" messaging — AC-40 vs
 * AC-42 — the conflicts array itself is computed server-side, D6/N13).
 */
export function participatingCount(columns: AgentColumn[]): number {
  return columns.filter((c) => c.status === "done").length;
}

/** AC-49 — every grouped run failed to complete. */
export function allFailed(columns: AgentColumn[]): boolean {
  return columns.length > 0 && columns.every((c) => c.status === "failed");
}

/**
 * AC-58 — status carries a TEXT/glyph marker, never colour alone. Maps each
 * `AgentColumn.status` to the i18n key (`runs.column.*`) and icon its badge
 * uses; `'done'` has no key of its own (a settled run just shows its score/
 * verdict, matching D20's kept-as-is `column.*` keys — only the three
 * still-in-flight/unsettled states need a label).
 */
export function columnStatusIcon(status: AgentColumn["status"]): IconName {
  switch (status) {
    case "failed":
      return "AlertOctagon";
    case "cancelled":
      return "Slash";
    case "running":
      return "RefreshCw";
    case "done":
      return "CheckCircle";
  }
}

/**
 * AC-50 — when EVERY column's recorded error is the identical string (the
 * shape a shared pre-work failure like a diff-load error produces,
 * `run-executor.ts:78-97`), the UI must render that reason ONCE, not N
 * identical per-agent lines. Returns null when errors differ (or are
 * missing), so the caller falls back to listing each column's own reason.
 */
export function sharedFailureReason(columns: AgentColumn[]): string | null {
  if (!allFailed(columns)) return null;
  const reasons = new Set(columns.map((c) => c.error ?? ""));
  if (reasons.size !== 1) return null;
  const [reason] = reasons;
  return reason || null;
}
