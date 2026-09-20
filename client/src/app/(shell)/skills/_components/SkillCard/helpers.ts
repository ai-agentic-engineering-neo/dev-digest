import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { SKILL_SOURCE_ICON, SKILL_TYPE_COLOR } from "@/components/skills";

/** Resolve the chip colour for a skill's type. */
export function typeColor(type: SkillType): string {
  return SKILL_TYPE_COLOR[type];
}

/** Resolve the icon for a skill's source. */
export function sourceIcon(source: SkillSource): IconName {
  return SKILL_SOURCE_ICON[source];
}
