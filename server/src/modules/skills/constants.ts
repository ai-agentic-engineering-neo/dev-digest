/** skills — pure values (ring 2). No imports, no I/O. */

export const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;
export const SKILL_SOURCES = ['manual', 'imported_file', 'imported_url', 'extracted', 'community'] as const;
/** Sources a client may set on create: hand-written or file/archive import. */
export const CREATABLE_SKILL_SOURCES = ['manual', 'imported_file'] as const;

/** Import: raw upload cap (decoded bytes) and the file kinds we open. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.txt'] as const;
export const ARCHIVE_EXTENSIONS = ['.zip'] as const;
/** Archive entries that are never read, listed as ignored in the preview. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.py', '.js', '.mjs', '.cjs', '.ts', '.rb', '.ps1', '.bat', '.cmd', '.exe', '.bin', '.pl', '.php',
] as const;
/** Preferred archive entries for the skill core, in order. */
export const CORE_FILE_NAMES = ['skill.md', 'readme.md'] as const;
/** Longest auto-derived description (first paragraph of the body). */
export const MAX_DERIVED_DESCRIPTION_CHARS = 200;

/** Upper bound on a skill body; larger bodies blow the prompt budget. */
export const MAX_BODY_CHARS = 50_000;

/** Skill names are kebab-case slugs (`pr-quality-rubric`), unique per workspace. */
export const MAX_NAME_CHARS = 64;
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Version recorded for a newly-created skill (and its first `skill_versions` row). */
export const INITIAL_SKILL_VERSION = 1;
