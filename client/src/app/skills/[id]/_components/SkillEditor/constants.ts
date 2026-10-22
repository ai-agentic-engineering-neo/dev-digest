import type { IconName } from "@devdigest/ui";

export type SkillTab = "config" | "preview" | "versions";
export const SKILL_TABS: readonly SkillTab[] = ["config", "preview", "versions"];

export const TAB_ICONS: Record<SkillTab, IconName> = {
  config: "Settings",
  preview: "Eye",
  versions: "History",
};
