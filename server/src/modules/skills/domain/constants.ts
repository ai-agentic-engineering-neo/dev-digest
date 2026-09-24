/** Limits and defaults of the skills module (server/specs/03-skills.md, Rules §7–§8). */

/** Max length of `content_base64` in a file import (≈ 1.5 MB decoded). */
export const IMPORT_MAX_BASE64_CHARS = 2 * 1024 * 1024;
/** Max entries in a `.zip` archive. */
export const ARCHIVE_MAX_ENTRIES = 500;
/** Max uncompressed size of the ONE markdown entry that is decoded. */
export const ARCHIVE_MAX_MARKDOWN_BYTES = 256 * 1024;

/** URL import: request timeout, body cap, redirect hops. */
export const URL_IMPORT_TIMEOUT_MS = 10_000;
export const URL_IMPORT_MAX_BYTES = 1024 * 1024;
export const URL_IMPORT_MAX_REDIRECTS = 3;

/** Default and allowed stats window (`?days=`). */
export const STATS_DEFAULT_DAYS = 30;
export const STATS_MAX_DAYS = 365;

/** Fallback name when neither frontmatter nor file name yields a usable slug. */
export const FALLBACK_SKILL_NAME = 'imported-skill';

/** Text files accepted as a single-file import. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.txt'] as const;
/** Archive entries that are never read — listed as `executable`. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.fish', '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.rb', '.pl',
  '.php', '.go', '.rs', '.java', '.jar', '.exe', '.bat', '.cmd', '.ps1', '.bin', '.so', '.dylib', '.dll',
  '.wasm', '.lua', '.swift', '.kt',
] as const;
/** Folders whose content counts as executable whatever the extension. */
export const EXECUTABLE_DIRS = ['scripts', 'bin', 'hooks'] as const;
