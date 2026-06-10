/**
 * repo-intel module barrel.
 *
 * T1.0 exports the contract (types) + constants. T1.1 adds the facade
 * `RepoIntelService`, the thin Drizzle helpers (`RepoIntelRepository`), and
 * the Fastify routes plugin.
 */
export * from './types.js';
export * from './constants.js';
export * from './service.js';
export * from './repository.js';
export { default as repoIntelRoutes } from './routes.js';
