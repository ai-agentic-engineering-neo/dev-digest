import type { IconName } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";

/**
 * specs/13-multi-agent-review.md D21 — derived visual identity: a PURE hash
 * from an agent id into a fixed {color, icon} pair. No schema field, no
 * stored value (N14) — the same agent renders identically on every surface
 * (configure, results columns/tabs, and the PR-page picker) and across
 * reloads, because the input (`agent_id`) never changes. Exported so
 * `MultiAgentConfigureView` can reuse the exact same palette — do not
 * duplicate it.
 */
const IDENTITY_PALETTE: ReadonlyArray<{ color: string; icon: IconName }> = [
  { color: "#3b82f6", icon: "Cpu" },
  { color: "#10b981", icon: "Zap" },
  { color: "#f59e0b", icon: "Bug" },
  { color: "#8b5cf6", icon: "Shield" },
  { color: "#ec4899", icon: "Target" },
  { color: "#14b8a6", icon: "Gauge" },
  { color: "#f43f5e", icon: "Boxes" },
  { color: "#6366f1", icon: "Activity" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface AgentIdentity {
  color: string;
  icon: IconName;
}

export function agentIdentity(agentId: string): AgentIdentity {
  return IDENTITY_PALETTE[hashString(agentId) % IDENTITY_PALETTE.length]!;
}

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
