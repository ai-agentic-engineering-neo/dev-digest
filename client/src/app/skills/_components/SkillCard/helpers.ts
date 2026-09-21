import type { SkillSource, SkillType } from "@devdigest/shared";
import { SOURCE_ICON, TYPE_COLOR } from "./constants";

/** Resolve the chip colour for a skill's type. */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type];
}

/** Resolve the badge icon for a skill's source. */
export function sourceIcon(source: SkillSource) {
  return SOURCE_ICON[source];
}
