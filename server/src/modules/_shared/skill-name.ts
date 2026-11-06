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
    .slice(0, 64)
    // Trim AFTER slicing: a cut that lands on a separator must not leave a trailing dash.
    .replace(/^-+|-+$/g, '');
}

/** Max skill body length (chars) — a skill is prompt text, keep it bounded. */
export const MAX_SKILL_BODY_CHARS = 50_000;

/**
 * Name + body rules for any skill a module creates. Pure: returns the
 * user-facing problem (callers throw their ValidationError), or null.
 */
export function skillNameProblem(name: string): string | null {
  return SKILL_NAME_PATTERN.test(name)
    ? null
    : 'Skill name must be kebab-case (a-z, 0-9, dashes), e.g. "no-then-chains"';
}

export function skillBodyProblem(body: string): string | null {
  if (body.trim().length === 0) return 'Skill body is empty';
  if (body.length > MAX_SKILL_BODY_CHARS) return `Skill body exceeds ${MAX_SKILL_BODY_CHARS} characters`;
  return null;
}
