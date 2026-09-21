/** Constants for the skills module. */

import type { SkillType } from '@devdigest/shared';

/** Version recorded for a newly-created skill (mirrors INITIAL_AGENT_VERSION). */
export const INITIAL_SKILL_VERSION = 1;

/** Type assigned when neither frontmatter nor the heuristic can tell. */
export const DEFAULT_SKILL_TYPE: SkillType = 'custom';

/** Name used when an imported document has no frontmatter name and no heading. */
export const FALLBACK_SKILL_NAME = 'untitled-skill';

/**
 * Hard cap on a skill body. A skill is prose that gets prepended to EVERY review
 * prompt for every agent it is linked to, so an oversized one is a silent
 * per-run cost, not just a big row. 64k characters is roughly 16k tokens —
 * already far more than any reasonable rubric.
 */
export const MAX_SKILL_BODY_CHARS = 64_000;

/** Cap on the description — it is an interface blurb, not documentation. */
export const MAX_SKILL_DESCRIPTION_CHARS = 500;

/**
 * Keyword → type heuristic for imported documents with no declared type. Order
 * matters: the first group with a hit wins, so the more specific categories
 * (security) are listed before the vaguer ones.
 */
export const TYPE_KEYWORDS: ReadonlyArray<readonly [SkillType, readonly string[]]> = [
  ['security', ['security', 'vulnerab', 'injection', 'ssrf', 'secret', 'auth', 'xss', 'csrf']],
  ['rubric', ['rubric', 'scoring', 'score', 'grade', 'checklist', 'criteria']],
  ['convention', ['convention', 'style guide', 'naming', 'lint', 'idiom', 'formatting']],
];
