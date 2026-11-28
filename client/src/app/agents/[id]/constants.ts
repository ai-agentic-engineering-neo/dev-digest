import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * Agent editor tabs, in display order; the active one lives in `?tab=`.
 * Evals, Stats and CI arrive with their own milestones.
 */
export const TABS = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
] as const satisfies readonly EditorTab[];

export type AgentTab = (typeof TABS)[number]["key"];

/** Tabs reachable through `?tab=`; anything else falls back to `DEFAULT_TAB`. */
export const VALID_TABS: readonly AgentTab[] = TABS.map((tb) => tb.key);

/** Tab shown when `?tab=` is missing or unknown. */
export const DEFAULT_TAB: AgentTab = "config";
