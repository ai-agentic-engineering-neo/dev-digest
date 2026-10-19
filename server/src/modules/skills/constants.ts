/** L02 — skills module literals. */

/** The file a skill archive's core is taken from (Agent Skills convention). */
export const SKILL_CORE_FILE = 'skill.md';

/** Decoded upload size cap for the import preview (single .md or .zip). */
export const MAX_IMPORT_BYTES = 1_000_000;

/** Zip limits — checked from the central directory before anything is inflated. */
export const ARCHIVE_LIMITS = {
  maxEntries: 200,
  maxTotalBytes: 5_000_000,
  maxEntryBytes: 512_000,
} as const;

/** Extensions / folders whose files are code: listed as `executable`, never read. */
export const EXECUTABLE_EXTENSIONS = [
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'rb', 'pl', 'php', 'go', 'rs', 'java', 'lua',
  'exe', 'bin', 'so', 'dylib', 'dll', 'jar', 'wasm', 'app',
] as const;
export const EXECUTABLE_DIRS = ['scripts', 'bin', 'hooks'] as const;

/** Frontmatter keys that grant runtime powers in other tools — ignored here. */
export const IGNORED_FRONTMATTER_KEYS = ['allowed-tools', 'tools', 'hooks', 'mcp', 'model'] as const;

export const INITIAL_SKILL_VERSION = 1;

/** Window of the Stats tab "Findings (30d)" tile and category breakdown. */
export const STATS_WINDOW_DAYS = 30;
