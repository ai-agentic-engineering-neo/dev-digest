/**
 * Skills module constants — import limits and the "what is executable" list.
 *
 * The limits are deliberately small: a skill is a page of instructions, not a
 * package. Anything that needs more than this is not a skill, and refusing it
 * with a clear 422 is better than silently truncating the text that will end
 * up in an agent's prompt.
 */

/** Largest upload accepted (raw bytes, before base64). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Largest number of entries we will even look at inside an archive. */
export const MAX_ARCHIVE_ENTRIES = 200;

/** Largest single archive entry we will unpack. */
export const MAX_ENTRY_BYTES = 512 * 1024;

/** Largest skill body we will store (and therefore put into a prompt). */
export const MAX_BODY_CHARS = 64 * 1024;

/** Default type for an import whose frontmatter does not declare one. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/** Description used when an import carries none. */
export const FALLBACK_DESCRIPTION = 'Imported skill — add a directive description.';

/**
 * Extensions we treat as executable. Files matching these are never unpacked
 * from an archive: they are listed in the preview as skipped and nothing else.
 */
export const EXECUTABLE_EXTENSIONS = [
  'sh',
  'bash',
  'zsh',
  'fish',
  'js',
  'mjs',
  'cjs',
  'ts',
  'py',
  'rb',
  'pl',
  'php',
  'ps1',
  'bat',
  'cmd',
  'exe',
  'dll',
  'so',
  'bin',
] as const;

/** Directories whose contents are executable by convention, whatever the extension. */
export const EXECUTABLE_DIRS = ['scripts', 'bin', 'hooks', '.github'] as const;

/** Archive entries considered candidates for the skill core, best first. */
export const CORE_FILE_NAMES = ['skill.md', 'skill.markdown', 'readme.md', 'index.md'] as const;

/** The initial version number of a freshly created skill. */
export const INITIAL_SKILL_VERSION = 1;
