/**
 * Onion Architecture boundaries for server/src and ../reviewer-core/src.
 *
 * Rules and rationale: ../.claude/skills/onion-architecture/SKILL.md
 * Run from server/:  pnpm deps:validate
 *
 * One rule underlies all of them: imports point inward.
 *
 *   ring 0  domain          modules/<m>/domain.ts, constants.ts, @devdigest/shared
 *   ring 1  application     every other module file (service.ts, ports.ts, ...)
 *   ring 2  infrastructure  routes.ts, repository.ts, pipeline/, adapters/, db/, platform/
 *   ring 3  composition     platform/container.ts, app.ts, server.ts, modules/index.ts
 *
 * A module file is ring 1 unless its name says otherwise, so a new file is
 * held to the strict rules by default.
 */

// --- file classes -----------------------------------------------------------
const DOMAIN = '^src/modules/([^/]+)/(domain\\.ts|domain/.+|constants\\.ts)$';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const REPOSITORY = '^src/modules/[^/]+/(repository\\.ts|repository/.+)$';
const MODULE_INFRA =
  '^src/modules/[^/]+/(routes\\.ts|repository\\.ts|repository/.+|pipeline/.+)$';
const ROUTE_HELPERS = '^src/modules/_shared/';
const REVIEWER_CORE = '^\\.\\./reviewer-core/src/';

// Platform files that are pure and safe for ring 1. Everything else in
// platform/ does I/O or wiring and reaches a service only through a port.
const PURE_PLATFORM =
  '^src/platform/(errors|resilience|local-only|model-router|trace-builder)\\.ts$';

// Node built-ins that perform I/O. node:path, node:crypto, node:url stay legal.
const IO_BUILTINS =
  '^(node:)?(fs|child_process|net|http|https|http2|dns|tls|dgram|worker_threads|cluster|readline|os)(/|$)';

const ROUTE_PACKAGES =
  'node_modules/(fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/[^/]+|zod)/';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Cycles break module init order and make the rings meaningless.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      comment:
        'domain.ts and constants.ts hold rules and types only. They may import ' +
        'their own module\'s domain files, @devdigest/shared, reviewer-core, ' +
        'zod and platform/errors.ts — no I/O, no framework, no other ring.',
      severity: 'error',
      from: { path: DOMAIN },
      to: {
        pathNot: [
          '^src/modules/$1/(domain\\.ts|domain/.+|constants\\.ts)$',
          '^src/vendor/shared/',
          REVIEWER_CORE,
          'node_modules/zod/',
          '^src/platform/errors\\.ts$',
        ],
      },
    },
    {
      name: 'core-no-infrastructure',
      comment:
        'Services and other use-case files reach the database, adapters, ' +
        'config, jobs, SSE and the container only through a port passed into ' +
        'their constructor. Declare the port in ports.ts.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/', pathNot: [MODULE_INFRA, ROUTE_HELPERS] },
      to: {
        path: ['^src/db/', '^src/adapters/', '^src/platform/', ROUTE_HELPERS],
        pathNot: [PURE_PLATFORM],
      },
    },
    {
      name: 'core-no-packages',
      comment:
        'The core imports no npm package except zod: no fastify, drizzle-orm, ' +
        'SDK clients or queues. Wrap the package in an adapter behind a port.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/', pathNot: [MODULE_INFRA, ROUTE_HELPERS] },
      to: { path: 'node_modules/', pathNot: ['node_modules/zod/'] },
    },
    {
      name: 'core-no-io-builtins',
      comment:
        'No filesystem, network or process access in the core. Put it in an ' +
        'adapter or repository and inject it.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/', pathNot: [MODULE_INFRA, ROUTE_HELPERS] },
      to: { dependencyTypes: ['core'], path: IO_BUILTINS },
    },
    {
      name: 'core-uses-ports',
      comment:
        'A service depends on the interface in ports.ts, never on the concrete ' +
        'repository, pipeline or routes file. Wiring happens at the top of the ' +
        'routes.ts plugin or in platform/container.ts.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/', pathNot: [MODULE_INFRA, ROUTE_HELPERS] },
      to: { path: MODULE_INFRA },
    },
    {
      name: 'routes-are-thin',
      comment:
        'routes.ts parses the request, calls one service method and shapes the ' +
        'response. A query, an adapter or an SDK in a route means a service ' +
        'method is missing.',
      severity: 'error',
      from: { path: ROUTES },
      to: {
        path: ['^src/db/', '^src/adapters/', 'node_modules/'],
        pathNot: [ROUTE_PACKAGES],
      },
    },
    {
      name: 'repository-is-persistence-only',
      comment:
        'A repository knows the database and its own module\'s domain and ' +
        'ports. It never imports HTTP code, adapters, the container or a service.',
      severity: 'error',
      from: { path: REPOSITORY },
      to: {
        path: [
          '^src/adapters/',
          '^src/platform/container\\.ts$',
          ROUTE_HELPERS,
          '^src/modules/[^/]+/(routes|service)\\.ts$',
          'node_modules/(fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/[^/]+)/',
        ],
      },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'A module is used through its index.ts. Anything else another module ' +
        'needs is wired in platform/container.ts. Type-only imports count.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/.+' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: ['^src/modules/$1/.+', '^src/modules/[^/]+/index\\.ts$', ROUTE_HELPERS],
      },
    },
    {
      name: 'adapters-implement-ports',
      comment:
        'An adapter may import a module\'s ports.ts to implement it, and ' +
        'nothing else from modules/. It never imports the container.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: {
        path: ['^src/modules/', '^src/platform/container\\.ts$'],
        pathNot: ['^src/modules/[^/]+/ports\\.ts$'],
      },
    },
    {
      name: 'platform-below-modules',
      comment:
        'platform/ is shared infrastructure and knows no feature module. Only ' +
        'container.ts, the composition root, wires modules together.',
      severity: 'error',
      from: { path: '^src/platform/', pathNot: ['^src/platform/container\\.ts$'] },
      to: { path: '^src/modules/' },
    },
    {
      name: 'db-is-a-leaf',
      comment: 'Schema and client code depend on nothing above them.',
      severity: 'error',
      from: { path: '^src/db/', pathNot: ['^src/db/(seed|seed-prompts|migrate)\\.ts$'] },
      to: { path: '^src/(modules|adapters|platform)/' },
    },
    {
      name: 'no-import-of-cli-scripts',
      comment:
        'seed.ts and migrate.ts are entrypoints with side effects. Move a ' +
        'shared constant to its own file instead of importing the script.',
      severity: 'error',
      from: { pathNot: ['^src/db/(seed|seed-prompts|migrate)\\.ts$'] },
      to: { path: '^src/db/(seed|seed-prompts|migrate)\\.ts$' },
    },
    {
      name: 'contracts-are-pure',
      comment: '@devdigest/shared is the domain language: zod and nothing else.',
      severity: 'error',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: ['^src/vendor/shared/', 'node_modules/zod/'] },
    },
    {
      name: 'reviewer-core-no-server',
      comment:
        'reviewer-core imports nothing from server except the shared contracts.',
      severity: 'error',
      from: { path: REVIEWER_CORE },
      to: { path: '^src/', pathNot: ['^src/vendor/shared/'] },
    },
    {
      name: 'reviewer-core-is-pure',
      comment:
        'reviewer-core does no I/O. Its one adapter is llm/openrouter.ts; every ' +
        'other file imports only zod, the shared contracts and the pure ' +
        'zod-to-JSON-Schema helper openai/helpers/zod.',
      severity: 'error',
      from: { path: REVIEWER_CORE, pathNot: ['llm/openrouter\\.ts$'] },
      to: {
        pathNot: [
          REVIEWER_CORE,
          '^src/vendor/shared/',
          'node_modules/zod/',
          'node_modules/openai/helpers/zod',
        ],
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // Type-only imports count: a service typed by a Drizzle row is a leak
    // even though nothing survives to runtime.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
