/**
 * repo-intel module barrel — the public surface other modules may use: the
 * `RepoIntel` contract (types), the constants (job kinds, limits) and the
 * facade class. Pipeline internals (application/, domain/, infrastructure/)
 * stay private; consumers go through `container.repoIntel`.
 */
export * from './types.js';
export * from './constants.js';
export { RepoIntelService, type ResyncRequest } from './service.js';
