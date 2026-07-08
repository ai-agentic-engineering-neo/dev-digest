/* helpers.ts — pure display transforms for CiRunsView. Kept out of JSX per the
   frontend-architecture "no derivation in the template" rule. */
import type { IconName } from "@devdigest/ui";
import type { CiRun, CiRunStatus } from "@devdigest/shared";

export interface StatusMeta {
  key: CiRunStatus | "unknown";
  /** Key under the `ci.runs.status.*` i18n namespace; `null` for values with no
      scaffolded translation (renders the raw status literal instead). */
  labelKey: "succeeded" | "noFindings" | "failed" | "running" | null;
  color: string;
  bg: string;
  icon: IconName;
}

/** Visual meta for the combined verdict/status column. Status (CI run lifecycle
    outcome) drives color — it is the deterministic gate result, matching the
    convention used for PR run history. */
export function statusMeta(status: string | null | undefined): StatusMeta {
  switch (status) {
    case "succeeded":
      return {
        key: "succeeded",
        labelKey: "succeeded",
        color: "var(--ok)",
        bg: "var(--ok-bg)",
        icon: "CheckCircle",
      };
    case "failed":
      return {
        key: "failed",
        labelKey: "failed",
        color: "var(--crit)",
        bg: "var(--crit-bg)",
        icon: "XCircle",
      };
    case "no_findings":
      return {
        key: "no_findings",
        labelKey: "noFindings",
        color: "var(--info)",
        bg: "var(--info-bg)",
        icon: "Check",
      };
    case "running":
      return {
        key: "running",
        labelKey: "running",
        color: "var(--accent)",
        bg: "var(--accent-bg)",
        icon: "RefreshCw",
      };
    default:
      return {
        key: "unknown",
        labelKey: null,
        color: "var(--text-muted)",
        bg: "var(--bg-hover)",
        icon: "Dot",
      };
  }
}

/** PR column: `pr_id` is nullable for external/fork CI PRs (AC-33) — fall back
    to the raw `pr_number` (plain text, no internal link) or an em dash. */
export function formatPrCell(run: Pick<CiRun, "pr_number">): string {
  return run.pr_number != null ? `#${run.pr_number}` : "–";
}

/** `duration_s` -> "12s" / "1m 23s". Null/undefined -> em dash. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** `ran_at` (ISO) -> a short locale timestamp. Null -> em dash. */
export function formatTimestamp(ranAt: string | null | undefined): string {
  if (!ranAt) return "–";
  const d = new Date(ranAt);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString();
}
