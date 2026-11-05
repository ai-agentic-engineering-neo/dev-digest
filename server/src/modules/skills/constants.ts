/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Max skill body length (chars) — a skill is prompt text, keep it bounded. */
export const MAX_SKILL_BODY_CHARS = 50_000;

/** Max raw upload size for an import (a .md file or a .zip archive). */
export const MAX_IMPORT_BYTES = 1_048_576; // 1 MiB

/** Route body limit for imports: base64 inflates by 4/3, plus JSON envelope. */
export const IMPORT_BODY_LIMIT = 1_600_000;

/** Archive guards: entry count and per-entry / total uncompressed size. */
export const MAX_ARCHIVE_ENTRIES = 200;
export const MAX_ARCHIVE_ENTRY_BYTES = 262_144; // 256 KiB
export const MAX_ARCHIVE_TOTAL_BYTES = 2_097_152; // 2 MiB

/** The canonical skill entrypoint inside an archive (Claude-style skill folder). */
export const SKILL_ENTRY_FILENAME = 'skill.md';

/** Text files we read from an archive; everything else is listed as ignored. */
export const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt'];

/** Files that could execute if someone ran them — never processed, always flagged. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.bat', '.cmd', '.com', '.exe', '.msi',
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.py', '.pyc', '.rb', '.pl',
  '.php', '.lua', '.jar', '.class', '.bin', '.dll', '.so', '.dylib', '.wasm', '.app', '.vbs',
];
