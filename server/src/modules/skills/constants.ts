/** Skills module constants (data only). */

/** Every skill starts at v1. */
export const INITIAL_SKILL_VERSION = 1;

/** The only source this milestone creates (imports come later). */
export const MANUAL_SOURCE = 'manual' as const;

export const INITIAL_VERSION_MESSAGE = 'Initial version';
export const EDITED_BODY_MESSAGE = 'Edited body';
export const restoredFromMessage = (version: number): string => `Restored from v${version}`;

/** Stats panel window ("Agent activity, last 30 days"). */
export const STATS_WINDOW_DAYS = 30;

/** Only completed runs count towards agent activity. */
export const DONE_RUN_STATUS = 'done';

/** Postgres unique_violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';
