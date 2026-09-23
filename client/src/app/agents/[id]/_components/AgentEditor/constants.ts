import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. specs/16-agent-performance-dashboard.md adds Stats, built
 *  from `GET /agents/:id/stats` (the same query the `/agent-performance`
 *  dashboard uses). */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "ListChecks" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart3" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "Zap" },
];
