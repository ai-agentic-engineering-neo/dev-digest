/**
 * Onion-architecture boundaries for `@devdigest/api`.
 *
 * Source of truth for the layer rules; the `onion-architecture-backend` skill
 * (`.claude/skills/onion-architecture-backend/`) explains each ring and how to
 * fix a violation. `pnpm lint:arch` runs this against the baseline in
 * `.dependency-cruiser-known-violations.json`: legacy violations are tolerated,
 * new ones fail. `pnpm lint:arch:baseline` regenerates the baseline (only when
 * a violation was intentionally accepted or removed).
 *
 * Rings (inner → outer), as path regexes over `src/`:
 *   contracts   src/vendor/shared/**            zod contracts + adapter interfaces (leaf)
 *   ports       src/modules/<m>/{ports,types}.ts interfaces the module's service depends on
 *   application src/modules/<m>/**  except routes.ts and repository*  (services, helpers, executors)
 *   driven      src/modules/<m>/repository*, src/db/**, src/adapters/**, platform/{jobs,sse,price-book,...}
 *   driving     src/modules/<m>/routes.ts, src/modules/_shared/**, src/app.ts
 *   root        src/platform/container.ts, src/app.ts, src/server.ts
 */

const MODULE = '^src/modules/([^/]+)/';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const REPOSITORY = '^src/modules/[^/]+/repository(\\.ts|/.+\\.ts)$';
const PORTS = '^src/modules/[^/]+/(ports|types)\\.ts$';
// Application = anything in a module folder that is not routes, repository, ports or _shared.
const APPLICATION = '^src/modules/(?!_shared/)[^/]+/(?!routes\\.ts$|repository(\\.ts|/)|ports\\.ts$|types\\.ts$).+\\.ts$';
const ADAPTERS = '^src/adapters/';
const SHARED = '^src/vendor/shared/';
const CONTAINER = '^src/platform/container\\.ts$';
const DB = '^src/db/';
const DB_SCHEMA = '^src/db/(schema\\.ts|schema/|rows\\.ts)';
const DRIZZLE = 'drizzle-orm';
const FASTIFY = '(^|/)(fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/)';
const REVIEWER_CORE = 'reviewer-core/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Runtime cycles make the ring order meaningless. Type-only cycles (a service importing `type Container` while the container imports the service) are ignored here and caught by application-no-container instead.',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'An unresolvable import usually means a broken tsconfig path alias.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'routes-no-persistence',
      severity: 'error',
      comment: 'Rule 1: routes.ts is a driving adapter. It calls a service; it never queries Drizzle, imports src/db or a repository.',
      from: { path: ROUTES },
      to: { path: [DRIZZLE, DB, REPOSITORY] },
    },
    {
      name: 'drizzle-only-in-driven-ring',
      severity: 'error',
      comment: 'Rule 2: drizzle-orm is a driver. Only repositories, src/db, src/adapters and platform infrastructure may import it.',
      from: {
        path: '^src/',
        pathNot: [REPOSITORY, DB, ADAPTERS, '^src/platform/jobs\\.ts$', '^src/app\\.ts$'],
      },
      to: { path: DRIZZLE },
    },
    {
      name: 'application-no-row-types',
      severity: 'error',
      comment: 'Rule 4: $inferSelect row types are persistence types. Services and executors work on DTOs mapped in helpers.ts; the repository port returns DTOs.',
      from: { path: APPLICATION },
      to: { path: DB_SCHEMA },
    },
    {
      name: 'application-no-fastify',
      severity: 'error',
      comment: 'Rule 8: services, helpers and executors never see the HTTP framework. Request-bound data is resolved in routes.ts and passed as plain values.',
      from: { path: [APPLICATION, PORTS, REPOSITORY] },
      to: { path: FASTIFY },
    },
    {
      name: 'application-no-container',
      severity: 'error',
      comment: 'Rule 3: a service receives an explicit deps object (repository port + adapters it uses) by constructor. Importing Container is Service Locator: it hides the real dependencies. routes.ts builds the deps from app.container.',
      from: { path: [APPLICATION, PORTS, REPOSITORY, ADAPTERS] },
      to: { path: CONTAINER },
    },
    {
      name: 'adapters-no-modules',
      severity: 'error',
      comment: 'Rule 5: a driven adapter implements a port from @devdigest/shared or a module ports.ts; it never depends on module code. Move shared constants to the port file or into the adapter.',
      from: { path: ADAPTERS },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module',
      severity: 'error',
      comment: 'Rule 6: modules do not import each other. Share through @devdigest/shared, or expose the dependency on Container and inject it.',
      from: { path: MODULE },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment: 'Rule 7: @devdigest/shared (ring 0/1) imports nothing from the server. It is copied verbatim to the client.',
      from: { path: SHARED },
      to: { path: '^src/', pathNot: SHARED },
    },
    {
      name: 'ports-are-pure',
      severity: 'error',
      comment: 'Rule 3: a ports.ts/types.ts file declares interfaces and plain types only: no drivers, no db, no framework, no container.',
      from: { path: PORTS },
      to: { path: [DRIZZLE, DB, FASTIFY, CONTAINER, ADAPTERS, '^src/modules/[^/]+/(service|repository|routes)'] },
    },
    {
      name: 'repositories-stay-below-services',
      severity: 'error',
      comment: 'Rule 3/11: a repository implements a port; it never calls a service, a route or another module.',
      from: { path: REPOSITORY },
      to: { path: ['^src/modules/[^/]+/(service|routes|run-executor)\\.ts$'] },
    },
    {
      name: 'reviewer-core-boundary',
      severity: 'error',
      comment: 'Only platform/*, modules/reviews/* and the shared contracts may import @devdigest/reviewer-core. Everything else gets its output through the reviews module.',
      from: { path: '^src/', pathNot: ['^src/platform/', '^src/modules/reviews/', '^src/vendor/shared/contracts/'] },
      to: { path: REVIEWER_CORE },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', 'reviewer-core/'] },
    exclude: { path: ['\\.test\\.ts$', '^src/db/migrations/'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
