/** Constants for the skills module (specs/02-skills.md). */

/** D3 — a skill name is a slug, unique per workspace. */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Author's optional note on a version (skill_versions.message), §5.2. */
export const MAX_VERSION_MESSAGE_LENGTH = 200;

/** Default window for GET /skills/:id/stats when `?days=` is omitted (§7.2). */
export const DEFAULT_STATS_WINDOW_DAYS = 30;

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---- Import (§7.4) ----------------------------------------------------------

/** Decoded upload cap, enforced before parsing starts. */
export const MAX_IMPORT_UPLOAD_BYTES = 512 * 1024;

/** Max zip entries before the archive is rejected outright. */
export const MAX_ZIP_MEMBERS = 200;

/** Max total uncompressed size of a zip's members. */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;

/** Max size of the chosen core markdown file (inside a .md upload or a .zip). */
export const MAX_IMPORT_MARKDOWN_BYTES = 256 * 1024;

/** Derived description cap (frontmatter.description, or the first paragraph). */
export const MAX_IMPORT_DESCRIPTION_LENGTH = 200;

/**
 * Extensions that make an archive member "look executable" — never imported,
 * never run, just listed as a warning in the preview.
 */
export const EXECUTABLE_EXTENSIONS = [
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.ps1',
  '.psm1',
  '.exe',
  '.so',
  '.dll',
  '.dylib',
  '.bat',
  '.cmd',
  '.jar',
  '.rb',
  '.pl',
  '.php',
];
