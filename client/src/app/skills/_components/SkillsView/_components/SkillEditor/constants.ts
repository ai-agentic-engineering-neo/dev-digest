import type { IconName } from "@devdigest/ui";
import { VALID_TABS, type SkillTab } from "../../constants";

export interface SkillEditorTab {
  key: SkillTab;
  labelKey: string;
  icon: IconName;
}

/** Tab bar order — mirrors the design's Config · Preview · Evals · Stats · Versions. */
export const TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

export { VALID_TABS };
