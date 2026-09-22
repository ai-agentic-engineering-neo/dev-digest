import { SKILL_NAME_MAX, SKILL_NAME_RE } from "@devdigest/shared/constants/skills";
import { DEFAULT_SKILL_TAB, SKILL_TABS, type SkillTab } from "./constants";

/** First value of a raw search param (Next passes repeated params as arrays). */
function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Normalize ?tab= for the skill editor (missing, repeated or unknown → config). */
export function resolveSkillTab(raw: string | string[] | undefined): SkillTab {
  const value = first(raw);
  return SKILL_TABS.find((t) => t === value) ?? DEFAULT_SKILL_TAB;
}

/** Normalize ?preview= on /skills (empty → no drawer). */
export function resolvePreviewId(raw: string | string[] | undefined): string | null {
  return first(raw)?.trim() || null;
}

/** /skills, optionally with the side preview drawer open on a skill. */
export function skillsHref(previewId?: string | null): string {
  return previewId ? `/skills?${new URLSearchParams({ preview: previewId }).toString()}` : "/skills";
}

/** Skill editor URL on a given tab. */
export function skillHref(id: string, tab: SkillTab = DEFAULT_SKILL_TAB): string {
  return `/skills/${encodeURIComponent(id)}?${new URLSearchParams({ tab }).toString()}`;
}

/** Contract name rule: kebab slug, 1..SKILL_NAME_MAX chars. */
export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= SKILL_NAME_MAX && SKILL_NAME_RE.test(name);
}

/** Rough token estimate shown under the body editor (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** A 0..1 rate as a whole percent; null (no denominator) → null. */
export function formatRate(rate: number | null | undefined): string | null {
  return rate == null ? null : `${Math.round(rate * 100)}%`;
}

/** The block header the server puts above a skill's body in the prompt
 *  (server/specs/03-skills.md Rules §5). Prompt text, not UI copy: it must
 *  match the server byte for byte, so it is not translated. */
export function skillBlockHeader(name: string, description: string): string {
  const desc = description.trim();
  return desc ? `### ${name}\n_Applies when:_ ${desc}` : `### ${name}`;
}
