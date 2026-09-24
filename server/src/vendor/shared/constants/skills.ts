/**
 * Zod-free skill limits and the name rule, re-exported by contracts/knowledge.
 * Import this subpath (`@devdigest/shared/constants/skills`) from client
 * bundles that must not pull zod in.
 */
export const SKILL_BODY_MAX = 20_000;
export const SKILL_DESCRIPTION_MAX = 300;
export const SKILL_NAME_MAX = 64;
/** Kebab slug, shown as "<name>.md". */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
