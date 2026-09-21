import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** Skill type → chip colour (rubric=blue, convention=green, security=red, custom=gray). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "var(--text-secondary)",
};

/** Skill source → badge icon (manual=Edit, extracted=Sparkles, community=Globe, imported_url=Link). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Sparkles",
  community: "Globe",
  imported_url: "Link",
};
