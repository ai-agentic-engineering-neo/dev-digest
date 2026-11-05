import type { CreateConventionsSkillInput } from "../../../../../../../../lib/hooks/conventions";
import { SKILL_NAME_PATTERN } from "./constants";

/** Rough token estimate (~4 chars per token), same heuristic as the run trace. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function canCreateSkill(form: CreateConventionsSkillInput): boolean {
  return SKILL_NAME_PATTERN.test(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}
