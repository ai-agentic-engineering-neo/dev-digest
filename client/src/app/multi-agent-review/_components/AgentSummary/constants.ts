import type { AgentColumn } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export type LiveAgentStatus = "running" | "done" | "failed";

/** Fold a raw persisted run status into the 3 live states this view renders.
    `cancelled` has no separate affordance here → shown as `failed`. */
export function toLiveStatus(status: AgentColumn["status"]): LiveAgentStatus {
  return status === "cancelled" ? "failed" : status;
}

/** Status → icon + colour tokens. Icon + label always accompany colour
    (WCAG AA: status is never colour-alone). */
export const STATUS_META: Record<LiveAgentStatus, { icon: IconName; color: string; bg: string }> = {
  running: { icon: "RefreshCw", color: "var(--accent)", bg: "var(--accent-bg)" },
  done: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
};
