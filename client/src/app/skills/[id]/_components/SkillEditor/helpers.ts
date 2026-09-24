import type { Skill, UpdateSkillInput } from "@devdigest/shared";

/** Fields the editor edits. The draft holds only the ones the user touched. */
export type SkillDraft = Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;

/** Draft fields whose value differs from the live skill. */
export function changedFields(draft: SkillDraft, skill: Skill): SkillDraft {
  const out: SkillDraft = {};
  for (const key of Object.keys(draft) as (keyof SkillDraft)[]) {
    if (draft[key] !== undefined && draft[key] !== skill[key]) Object.assign(out, { [key]: draft[key] });
  }
  return out;
}

/** Whether a change creates a new version (body or description changed). */
export function isVersionedChange(changes: SkillDraft): boolean {
  return "body" in changes || "description" in changes;
}

/** PUT body: only the changed fields, plus base_version when the change is
 *  versioned (optimistic concurrency: 409 stale_version if someone saved first). */
export function buildSavePatch(changes: SkillDraft, skill: Skill): UpdateSkillInput {
  return isVersionedChange(changes) ? { ...changes, base_version: skill.version } : { ...changes };
}
