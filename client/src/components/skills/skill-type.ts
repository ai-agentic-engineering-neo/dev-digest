import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/**
 * How a skill's type and source are drawn, wherever a skill is shown.
 *
 * Shared because two unrelated routes render the same legend — the Skills
 * library (`/skills`) and the agent editor's Skills tab — and the route
 * boundary rule in `.dependency-cruiser.cjs` forbids one reaching into the
 * other's `_components/`. Two copies would let the same chip mean two colours.
 */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_url: "Globe",
  imported_file: "Upload",
  extracted: "Zap",
  community: "Users",
};
