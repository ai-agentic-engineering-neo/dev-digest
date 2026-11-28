import { SkillName, SkillType, type SkillInput } from "@devdigest/shared";
import { DEFAULT_TAB, VALID_TABS, type SkillTab } from "./constants";

/** The four content fields a skill form edits. */
export type SkillDraft = Pick<SkillInput, "name" | "description" | "type" | "body">;

/** Whether `raw` names a skill detail tab. */
function isSkillTab(raw: string | null | undefined): raw is SkillTab {
  return (VALID_TABS as readonly (string | null | undefined)[]).includes(raw);
}

/** The `?tab=` value as a known tab; anything else falls back to Config. */
export function parseTab(raw: string | null | undefined): SkillTab {
  return isSkillTab(raw) ? raw : DEFAULT_TAB;
}

/** URL of a skill's detail pane on a given tab. */
export function skillHref(id: string, tab: SkillTab = DEFAULT_TAB): string {
  return `/skills/${encodeURIComponent(id)}?tab=${tab}`;
}

/** The content fields of a skill, a version or an import preview. */
export function toDraft(src: SkillDraft): SkillDraft {
  return { name: src.name, description: src.description, type: src.type, body: src.body };
}

/** Whether a select value is one of the skill types. */
export function isSkillType(value: string): value is SkillType {
  return SkillType.safeParse(value).success;
}

/** Whether the name is a valid skill slug (lowercase letters, digits, dashes). */
export function isValidSkillName(name: string): boolean {
  return SkillName.safeParse(name).success;
}

/**
 * A draft can be saved when the name is a valid slug and the description and
 * body are non-empty after trimming (the server requires all three).
 */
export function canSaveDraft(d: SkillDraft): boolean {
  return isValidSkillName(d.name) && d.description.trim() !== "" && d.body.trim() !== "";
}
