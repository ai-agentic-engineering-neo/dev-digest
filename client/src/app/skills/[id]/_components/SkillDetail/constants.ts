import type { IconName } from "@devdigest/ui";

/** Skill detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "context", labelKey: "tabs.context", icon: "Folder" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "tabs.stats", icon: "Gauge" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];
