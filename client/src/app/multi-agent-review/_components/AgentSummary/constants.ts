import type { IconName } from "@devdigest/ui";

export type LiveAgentStatus = "running" | "done" | "failed";

/** Status → icon + colour tokens. Icon + label always accompany colour
    (WCAG AA: status is never colour-alone). */
export const STATUS_META: Record<LiveAgentStatus, { icon: IconName; color: string; bg: string }> = {
  running: { icon: "RefreshCw", color: "var(--accent)", bg: "var(--accent-bg)" },
  done: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
};
