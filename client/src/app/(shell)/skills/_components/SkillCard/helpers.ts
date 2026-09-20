import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { SOURCE_ICON, TYPE_COLOR } from "./constants";

/** Resolve the chip colour for a skill's type. */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type];
}

/** Resolve the icon for a skill's source. */
export function sourceIcon(source: SkillSource): IconName {
  return SOURCE_ICON[source];
}
