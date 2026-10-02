/** Constants for the skills module (extracted magic values). */

/** Largest skill body we accept, in bytes. Bodies are prompt text, not files. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Largest upload accepted by `POST /skills/import` (.md or .zip). */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** `POST /skills/import-url` fetch timeout — a slow/hanging host must not block the request. */
export const URL_FETCH_TIMEOUT_MS = 8_000;

/** Redirect hops `fetchSkillText` will follow manually, each re-validated
 *  against the SSRF guard — a plain host redirecting to an internal target
 *  must not bypass `assertPublicHttpUrl` just because the first hop passed. */
export const MAX_URL_REDIRECTS = 5;

/** Zip-bomb guard: refuse archives with more entries than this. */
export const ARCHIVE_ENTRY_LIMIT = 512;

/** Rolling window for the "FINDINGS (30D)" tile and the category donut. */
export const STATS_WINDOW_DAYS = 30;

/** Slug length cap — mirrors `SkillName` in the shared contracts. */
export const MAX_NAME_LENGTH = 64;

/** The one archive entry an import is allowed to read. Everything else is ignored. */
export const SKILL_MANIFEST_FILENAME = 'SKILL.md';

/** Every skill starts at v1; `skill_versions` only ever holds superseded bodies. */
export const INITIAL_SKILL_VERSION = 1;

/**
 * What an imported skill is created with, once the user confirms the preview.
 *
 * `type` is NOT inferred from the upload — guessing a security classification
 * from a stranger's markdown is exactly the wrong instinct, so the preview
 * defaults to `custom` and the user picks.
 *
 * `source` is `imported_url` for BOTH file paths (.md and .zip): `SkillSource`
 * has no `imported_file` member, and adding one would change a DB enum plus both
 * vendor copies — not worth a migration for a label the UI already renders as
 * "Imported".
 *
 * `enabled` is always false: an imported skill wears the "needs vetting" badge
 * until a human has read the instructions they are about to put in a prompt.
 */
export const IMPORT_DEFAULTS = {
  type: 'custom',
  source: 'imported_url',
  enabled: false,
} as const;
