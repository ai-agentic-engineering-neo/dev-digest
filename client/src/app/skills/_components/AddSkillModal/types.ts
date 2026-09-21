import type { Skill } from "@devdigest/shared";

/** How a skill got created; picks the success toast copy. */
export type AddedKind = "created" | "imported";

/** Shared prop of every tab: called once the server accepted the new skill. */
export interface AddSkillTabProps {
  onAdded: (skill: Skill, kind: AddedKind) => void;
}
