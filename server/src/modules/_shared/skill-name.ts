/**
 * Skill naming + size rules, shared by every module that creates skills (skills
 * library, conventions extractor). Pure — no framework or DB imports.
 */

/** Skill names are identifiers shown in the prompt and the UI: kebab-case. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Best-effort kebab-case slug from a free-form name / filename. */
export function toSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.(md|markdown|txt|zip)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Max skill body length (chars) — a skill is prompt text, keep it bounded. */
export const MAX_SKILL_BODY_CHARS = 50_000;
