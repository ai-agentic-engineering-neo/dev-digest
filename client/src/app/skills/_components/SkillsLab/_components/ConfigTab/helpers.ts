import type { Skill } from "@devdigest/shared";
import type { SkillInput } from "@/lib/hooks/skills";

export function formFromSkill(skill: Skill): SkillInput {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

export function emptyForm(): SkillInput {
  return { name: "", description: "", type: "custom", body: "" };
}
