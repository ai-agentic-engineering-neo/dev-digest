/**
 * Onion-architecture layer rules for @devdigest/api.
 *
 * Dependencies point inwards only:
 *   routes (presentation) -> service (application) -> ports / domain
 *   repository + adapters (infrastructure) implement ports and are wired in
 *   the composition root (platform/container.ts, app.ts, modules/index.ts).
 *
 * Violations that existed when these rules were introduced are recorded in
 * .dependency-cruiser-known-violations.json and do not fail `pnpm arch:check`.
 * Fix one -> regenerate the baseline with `pnpm arch:baseline`. Never add a new
 * violation to the baseline to make a change pass.
 *
 * Rationale and the layer map: .claude/skills/onion-architecture/SKILL.md
 */

/** Files that are allowed to know every layer: they wire the onion together. */
const COMPOSITION_ROOT = [
  '^src/platform/container\\.ts$',
  '^src/app\\.ts$',
  '^src/server\\.ts$',
  '^src/modules/index\\.ts$',
];

const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const APPLICATION = '^src/modules/[^/]+/(service|run-executor|findings)\\.ts$';
const REPOSITORY = '^src/modules/[^/]+/repository(\\.ts$|/)';
const DB = '^src/db/';
const DB_SCRIPTS = '^src/db/(migrate|seed)\\.ts$';
const ADAPTERS = '^src/adapters/';
const CONTRACTS = '^src/vendor/shared/';

/**
 * npm package paths. Unanchored on purpose: pnpm resolves to
 * node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>/, which still contains
 * `node_modules/<pkg>/`.
 */
const npm = (pkg) => `node_modules/${pkg}/`;
const ORM = npm('drizzle-orm');
const FASTIFY = npm('(fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/[a-z-]+)');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------- the dependency rule ----------
    {
      name: 'contracts-are-the-core',
      severity: 'error',
      comment:
        'vendor/shared is the innermost ring (contracts + ports). It may import zod and itself, nothing else.',
      from: { path: CONTRACTS },
      to: { pathNot: [CONTRACTS, npm('zod')], dependencyTypesNot: ['core'] },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'src/domain holds pure rules over contract types: no I/O, no framework, no ORM, no module or container.',
      from: { path: '^src/domain/' },
      to: { pathNot: ['^src/domain/', CONTRACTS, npm('zod')], dependencyTypesNot: ['core'] },
    },
    {
      name: 'routes-do-not-touch-the-db',
      severity: 'error',
      comment:
        'routes.ts is the presentation ring: validate, getContext, call the service (or, in a CRUD module, its own repository). Queries belong in repository.ts.',
      from: { path: ROUTES },
      to: { path: [DB, ORM] },
    },
    {
      name: 'application-does-not-know-the-orm',
      severity: 'error',
      comment:
        'Services and use cases reach data through a repository. They must not import drizzle-orm or db/schema.',
      from: { path: APPLICATION },
      to: { path: ['^src/db/(schema|client)', ORM] },
    },
    {
      name: 'no-framework-below-routes',
      severity: 'error',
      comment:
        'Only the presentation ring and the composition root know Fastify. Services, repositories and adapters stay framework-free.',
      from: { pathNot: [ROUTES, '^src/modules/_shared/', ...COMPOSITION_ROOT, '^src/platform/sse\\.ts$'] },
      to: { path: FASTIFY },
    },
    {
      name: 'no-concrete-adapters-in-modules',
      severity: 'error',
      comment:
        'Modules depend on ports (@devdigest/shared) and get implementations from the container. Importing src/adapters/** hard-wires one.',
      from: { path: '^src/modules/' },
      to: { path: ADAPTERS },
    },
    {
      name: 'infrastructure-does-not-call-inwards-code',
      severity: 'error',
      comment:
        'Adapters and repositories implement ports; they must not import services, routes or the container.',
      from: { path: [ADAPTERS, REPOSITORY] },
      to: {
        path: [
          '^src/modules/[^/]+/(routes|service|run-executor)\\.ts$',
          '^src/platform/container\\.ts$',
        ],
      },
    },
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        'A module does not reach into another module folder. Share through the container (repositories, facades) or @devdigest/shared.',
      from: { path: '^src/modules/([^/_][^/]*)/', pathNot: COMPOSITION_ROOT },
      to: { path: '^src/modules/[^/_][^/]*/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'nothing-imports-db-scripts',
      severity: 'error',
      comment: 'migrate/seed are entry points, not libraries.',
      from: {},
      to: { path: DB_SCRIPTS },
    },

    // ---------- hygiene ----------
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle means two rings each know the other; the onion has no inside any more.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^src/db/migrations/', '^src/vendor/shared/.*\\.test\\.ts$'] },
    includeOnly: ['^src/', npm('(zod|drizzle-orm|fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/[a-z-]+)')],
    // Type-only imports count: the dependency rule forbids even naming an outer type.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.d.ts'],
    },
  },
};
