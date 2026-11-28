/** Stats window for the skill cards + Stats tab. */
export const STATS_WINDOW_DAYS = 30;

/** Change note recorded on a skill's first version. */
export const INITIAL_CHANGE_NOTE = 'Initial version';

/** Change note recorded when an older version is restored. */
export const restoredNote = (version: number) => `Restored from v${version}`;

/** Import limits — a .md file / a whole .zip upload (decoded bytes). */
export const MAX_MD_BYTES = 256 * 1024;
export const MAX_ZIP_BYTES = 5 * 1024 * 1024;
/** base64 inflates by 4/3 — the request body cap for the preview route. */
export const IMPORT_BODY_LIMIT = Math.ceil((MAX_ZIP_BYTES * 4) / 3) + 64 * 1024;

/** Skill bodies above this many tokens get an import warning. */
export const LARGE_SKILL_TOKENS = 4000;
