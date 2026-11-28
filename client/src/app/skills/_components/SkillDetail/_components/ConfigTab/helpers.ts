import type { Skill, SkillUpdate } from "@devdigest/shared";
import type { SkillDraft } from "../../../../helpers";
import { changedSkillFields } from "../../helpers";
import { UNTRUSTED_SOURCES } from "./constants";

/** Whether the skill's text came from someone else. */
export function isUntrusted(skill: Pick<Skill, "source">): boolean {
  return UNTRUSTED_SOURCES.includes(skill.source);
}

/** The PATCH body: the changed fields, plus the note when one was typed. */
export function toSkillPatch(saved: SkillDraft, draft: SkillDraft, note: string): SkillUpdate {
  const trimmed = note.trim();
  return { ...changedSkillFields(saved, draft), ...(trimmed ? { note: trimmed } : {}) };
}

/** The server's token count when the body is unedited; `null` while it is edited. */
export function serverTokensFor(skill: Pick<Skill, "body" | "token_count">, body: string): number | null {
  return body === skill.body ? (skill.token_count ?? null) : null;
}
