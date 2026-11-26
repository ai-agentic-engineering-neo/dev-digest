import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs (M2 adds Skills; Evals / Stats / CI come in later milestones). */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
];

/** `?tab=` values the editor accepts; anything else falls back to `DEFAULT_TAB`. */
export const VALID_TABS: readonly string[] = TABS.map((tab) => tab.key);

export const DEFAULT_TAB = "config";
