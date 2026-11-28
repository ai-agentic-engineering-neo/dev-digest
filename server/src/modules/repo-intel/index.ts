/**
 * repo-intel public surface — the only file another module may import.
 *
 * Exports the contract (types) and constants. The service, repository and
 * routes are wired by `routes.ts` and `platform/container.ts`; consumers code
 * against the `RepoIntel` interface, reached through `container.repoIntel`.
 */
export * from './types.js';
export * from './constants.js';
