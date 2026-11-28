import type { IconName } from "@devdigest/ui";
import type { SkillTab } from "../SkillsView/constants";

/** Skill editor tabs (Evals arrive with M6 — intentionally absent). */
export const TABS: readonly { key: SkillTab; labelKey: string; icon: IconName }[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];
