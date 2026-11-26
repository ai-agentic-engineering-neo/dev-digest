/**
 * Identity of the rows the seed creates and the local (no-auth) provider looks
 * up. Kept apart from seed.ts so nothing has to import a script with side
 * effects to learn two names.
 */
export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';
