import type { CreateConventionsSkillInput } from "../../../../../../../../lib/hooks/conventions";
import { SKILL_NAME_PATTERN } from "./constants";

export { approxTokens } from "@/lib/tokens";

export function canCreateSkill(form: CreateConventionsSkillInput): boolean {
  return SKILL_NAME_PATTERN.test(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}
