/**
 * JobRunner kinds shared between modules (shared kernel). repos enqueues the
 * repo-intel jobs after a clone/refresh; repo-intel registers their handlers.
 * Keeping the names here avoids a repos → repo-intel import.
 */
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';
