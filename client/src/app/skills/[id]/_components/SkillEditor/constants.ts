import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface SkillEditorTab {
  key: "config" | "context" | "preview" | "versioning";
  labelKey: string;
  icon: IconName;
}

/** Tab order follows the design: Config, Context, Preview, Versions. */
export const SKILL_TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versioning", labelKey: "editor.tabs.versioning", icon: "History" },
];

export const VALID_SKILL_TABS = SKILL_TABS.map((t) => t.key);
export type SkillTabKey = SkillEditorTab["key"];
