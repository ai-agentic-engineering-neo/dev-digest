import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Type → chip colour. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Source → icon. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_url: "Globe",
  imported_file: "Upload",
  extracted: "Zap",
  community: "Users",
};
