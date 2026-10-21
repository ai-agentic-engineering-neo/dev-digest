/** skills — pure values (ring 2). No imports, no I/O. */

export const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;
export const SKILL_SOURCES = ['manual', 'imported_url', 'extracted', 'community'] as const;

/** Upper bound on a skill body; larger bodies blow the prompt budget. */
export const MAX_BODY_CHARS = 50_000;
