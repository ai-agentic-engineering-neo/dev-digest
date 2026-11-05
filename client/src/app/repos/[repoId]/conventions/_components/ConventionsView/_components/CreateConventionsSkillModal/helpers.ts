import type { CreateConventionsSkillInput } from "../../../../../../../../lib/hooks/conventions";
import { isValidSkillName } from "@/lib/skill-name";

export function canCreateSkill(form: CreateConventionsSkillInput): boolean {
  return isValidSkillName(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}
