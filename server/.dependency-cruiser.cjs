/**
 * Onion Architecture boundary rules for server/src. See the skill at
 * .claude/skills/onion-architecture/SKILL.md for the rings and rationale.
 *
 * Run:      pnpm arch:check
 * Ratchet:  pre-existing violations live in .dependency-cruiser-known-violations.json
 *           (suppressed via --ignore-known). After FIXING violations, regenerate:
 *             pnpm arch:baseline
 *           and review `git diff` on that file: it may only LOSE entries. Never run it
 *           to bless a new violation. The end state is an empty/deleted baseline.
 *           (This depcruise version has no shrink-only mode, so the diff review is the guard.)
 *           Entries for drizzle-orm embed its pnpm-resolved path, so after a drizzle upgrade
 *           they can show up as "new": regenerate once and confirm the entry COUNT is unchanged.
 *
 * `tsPreCompilationDeps: true` (below) is REQUIRED: most ORM-type leaks are
 * `import type` / type-only usages that TypeScript elides at compile time, so
 * without it the rules would not see them.
 */

// --- Ring membership (flat per-module files; see SKILL.md "Ring map") -------
const MODULE = '^src/modules/[^/]+/';
const ROUTES = `${MODULE}routes\\.ts$`;
// Ring 1-3: pure helpers/constants + application services + pipelines.
const INNER =
  `${MODULE}(service|run-executor|helpers|status|constants|findings|diff-loader)\\.ts$` +
  `|${MODULE}pipeline/`;
const REPOSITORY = `${MODULE}repository(\\.ts$|/)`;

const DRIZZLE = 'node_modules/drizzle-orm';
const DB_INTERNALS = '^src/db/';
const ADAPTERS = '^src/adapters/';
const CONTAINER = '^src/platform/container\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'routes-no-persistence',
      comment:
        'Routes are the outer edge: validate (Zod schema), call ONE service method, return. ' +
        'No Drizzle, no db/*, no adapters/*. Move the query into a repository behind a service.',
      severity: 'error',
      from: { path: ROUTES },
      to: { path: [DRIZZLE, DB_INTERNALS, ADAPTERS] },
    },
    {
      name: 'inner-no-outer',
      comment:
        'Domain helpers and application services must not import Fastify, Drizzle, db/* or concrete ' +
        'adapters/*. Depend on ports (vendor/shared/adapters.ts or module types.ts) and inject implementations.',
      severity: 'error',
      from: { path: INNER },
      to: { path: ['node_modules/fastify', 'node_modules/@fastify', DRIZZLE, DB_INTERNALS, ADAPTERS] },
    },
    {
      name: 'inner-no-container',
      comment:
        'Services must receive explicit narrow dependencies (repo ports, llm()/github() factories, ' +
        'jobs, logger), not the whole Container (service-locator). Only routes and the composition ' +
        'root may touch Container.',
      severity: 'error',
      from: { path: INNER },
      to: { path: CONTAINER },
    },
    {
      name: 'only-repository-touches-db',
      comment:
        'Drizzle and db/schema|rows may only be imported by repository files, db/*, adapters/* and ' +
        'the composition root. Catch-all for files not already covered by routes-no-persistence / ' +
        'inner-no-outer (e.g. settings/feature-models.ts, platform/jobs.ts).',
      severity: 'error',
      from: {
        path: '^src/(modules|platform)/',
        pathNot: [REPOSITORY, ROUTES, INNER, CONTAINER],
      },
      to: { path: [DRIZZLE, '^src/db/(schema|rows)'] },
    },
    {
      name: 'adapters-no-modules',
      comment:
        'Adapters implement ports for the inner rings; they must not import feature modules, the ' +
        'composition root, or seed data. Move shared constants to a neutral location.',
      severity: 'error',
      from: { path: ADAPTERS },
      to: { path: ['^src/modules/', '^src/db/seed', CONTAINER] },
    },
    {
      name: 'no-cross-module',
      comment:
        'A module may not reach into another module\'s internals. Use the other module\'s public ' +
        'surface (index.ts / types.ts), _shared/, or a port injected via the Container.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/[^/]+/(index|types)\\.ts$'],
      },
    },
    {
      name: 'platform-not-inward',
      comment:
        'platform/* (except the composition root container.ts) must not depend on feature modules.',
      severity: 'error',
      from: { path: '^src/platform/', pathNot: CONTAINER },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      comment:
        'Import cycles. dependencyTypesNot only exempts cycles whose FIRST edge is type-only, so ' +
        'cycles that close through an `import type` (Container <-> RepoIntelService, ' +
        'agents/helpers <-> repository) are still reported: they are the service-locator / ' +
        'misplaced-type smell and disappear once services take Deps and row types stop leaking.',
      severity: 'error',
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^\\.\\./reviewer-core'] },
    exclude: { path: ['\\.test\\.ts$', '^src/db/migrations'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
