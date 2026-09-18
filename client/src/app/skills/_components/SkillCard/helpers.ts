import type { SkillType } from "@devdigest/shared";
import { TYPE_COLOR } from "./constants";

/** Resolve the chip colour for a skill type. */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type] ?? "var(--text-secondary)";
}
