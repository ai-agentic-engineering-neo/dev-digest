import type { IconName } from "@devdigest/ui";

export interface DetailTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Skill detail tabs. Deliberately NO Evals tab — evals are out of scope for
   this feature even though the agent editor may grow one later. */
export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "Gauge" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);
