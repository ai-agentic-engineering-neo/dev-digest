import type { BlastNodeRole } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Per-role accent + icon for the detail panel and the list view (same tones as graph-canvas DEFAULT_ROLES). */
export const ROLE_META: Record<BlastNodeRole, { icon: IconName; color: string; bg: string }> = {
  changed: { icon: "Edit", color: "var(--warn)", bg: "var(--warn-bg)" },
  impacted: { icon: "Target", color: "var(--accent-text)", bg: "var(--accent-bg)" },
  entry_point: { icon: "Globe", color: "var(--ok)", bg: "var(--ok-bg)" },
  test: { icon: "FlaskConical", color: "var(--info)", bg: "var(--info-bg)" },
};

/** Graph canvas height on the Overview tab. */
export const GRAPH_HEIGHT = 560;
