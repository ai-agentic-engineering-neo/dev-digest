import type { Skill } from "@devdigest/shared";

/** A skill that did not originate in this studio — someone else's instructions. */
export function isImported(skill: Pick<Skill, "source">): boolean {
  return skill.source !== "manual";
}
