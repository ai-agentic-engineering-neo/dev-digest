import type { SkillFieldValues } from "../SkillFields";

export type AddSkillTab = "create" | "file";
export const ADD_TABS: readonly AddSkillTab[] = ["create", "file"];

export const EMPTY_SKILL: SkillFieldValues = { name: "", description: "", type: "rubric", body: "" };
