import type { IconName } from "@devdigest/ui";

/** Detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

export const DEFAULT_TAB = "config";

export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);

/** Width of the skill list rail, matching the agent editor's. */
export const SIDEBAR_WIDTH = 280;
