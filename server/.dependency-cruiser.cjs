/**
 * Onion Architecture layer check for `server/` (dependency-cruiser 17).
 * Rules & rationale: ../.claude/skills/onion-architecture/SKILL.md
 *
 * Run from `server/` (CI: .github/workflows/server-unit.yml → job `architecture`):
 *   node scripts/check-architecture.mjs            # fails only on NEW error-level violations
 *   node scripts/check-architecture.mjs --update   # rewrite architecture-baseline.json after FIXING some
 * Full raw report (all violations, incl. known):
 *   node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --output-type err
 *
 * Legacy violations are frozen in `architecture-baseline.json` as stable keys `rule|from|to`. The
 * baseline may only SHRINK: CI fails a PR whose baseline has keys the base branch's baseline lacks.
 * We don't use depcruise's own `--ignore-known`: it matches resolved paths, which under pnpm contain
 * the package version + entry file, so a dependency bump would turn known violations into "new" ones.
 *
 * Layer map (one module = `src/modules/<name>/`):
 *   domain.ts | domain/ | ports.ts           → core (pure)
 *   service.ts + other non-infra module files → application
 *   repository.ts | repository/ | *.repo.ts   → infrastructure (only owner of Drizzle)
 *   routes.ts                                 → presentation
 *   src/adapters/**                           → infrastructure (port implementations)
 *   src/platform/container.ts                 → composition root (may import anything)
 *
 * `preserveSymlinks` keeps pnpm symlink paths (`node_modules/drizzle-orm/index.d.ts` instead of
 * `node_modules/.pnpm/drizzle-orm@<ver>/…`), so package patterns below are anchored at `^node_modules/`.
 * (`collapse` is NOT a fix for baselines: it applies only at report time, after known-violation matching.)
 */

const DOMAIN = '^src/modules/[^/]+/(domain\\.ts$|domain/|ports\\.ts$)';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const INFRA_IN_MODULE = '^src/modules/[^/]+/(repository\\.ts$|repository/|.+\\.repo\\.ts$)';
const DRIZZLE = '^node_modules/(drizzle-orm|postgres)(/|$)';
const DB = '^src/db/';
const ADAPTERS = '^src/adapters/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'Core (domain.ts / ports.ts) must not depend on frameworks, DB, adapters, platform or the container. ' +
        'Only type-only imports from @devdigest/shared are allowed.',
      severity: 'error',
      from: { path: DOMAIN },
      to: {
        path: [
          DB,
          ADAPTERS,
          '^src/platform/',
          '^src/modules/[^/]+/(routes|service|repository)\\.ts$',
          '^node_modules/(fastify|@fastify|drizzle-orm|postgres|zod|octokit|simple-git|openai|@anthropic-ai|p-queue)(/|$)',
        ],
      },
    },
    {
      name: 'domain-shared-type-only',
      comment: 'Core may use @devdigest/shared contracts only via `import type` (no Zod runtime in the core).',
      severity: 'error',
      from: { path: DOMAIN },
      to: { path: '^src/vendor/shared/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'routes-no-data-access',
      comment: 'Presentation (routes.ts) must call a service; never Drizzle, db/schema or a repository directly.',
      severity: 'error',
      from: { path: ROUTES },
      to: { path: [DRIZZLE, DB, INFRA_IN_MODULE] },
    },
    {
      name: 'routes-no-adapters',
      comment: 'Presentation must not import concrete adapters; the service gets ports via the container.',
      severity: 'error',
      from: { path: ROUTES },
      to: { path: ADAPTERS },
    },
    {
      name: 'application-no-drizzle',
      comment: 'Application code (service, executors, helpers) must not use Drizzle/db schema — go through a repository port.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: [ROUTES, INFRA_IN_MODULE, DOMAIN] },
      to: { path: [DRIZZLE, '^src/db/(schema|client)'] },
    },
    {
      name: 'application-no-db-rows',
      comment: 'Application code should work with domain types, not persistence rows (`db/rows.ts`). Map in the repository.',
      severity: 'warn',
      from: { path: '^src/modules/', pathNot: [ROUTES, INFRA_IN_MODULE, DOMAIN] },
      to: { path: '^src/db/rows' },
    },
    {
      name: 'application-no-adapters',
      comment: 'Application code depends on ports (@devdigest/shared or ports.ts), never on src/adapters/** implementations.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: [INFRA_IN_MODULE] },
      to: { path: ADAPTERS },
    },
    {
      name: 'no-cross-module-imports',
      comment:
        'A module must not import another module folder; cross-module data goes through container getters ' +
        '(agentsRepo, reviewRepo, repoIntel). _shared/ is allowed.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/index\\.ts$' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'adapters-are-outer-ring',
      comment: 'Adapters implement ports; they must not depend on modules or the container.',
      severity: 'error',
      from: { path: ADAPTERS },
      to: { path: ['^src/modules/', '^src/platform/container'] },
    },
    {
      name: 'no-circular',
      comment:
        'Circular dependencies break the inward-only dependency rule. Cycles through the composition root ' +
        '(container.ts, which services import as a type) are excluded.',
      severity: 'warn',
      from: {},
      to: { circular: true, viaNot: '^src/platform/container\\.ts$' },
    },
  ],
  options: {
    // reviewer-core is a separate package (its deps aren't installed in every CI job) — don't descend
    // into it, so the graph is identical locally and in CI.
    doNotFollow: { path: ['node_modules', '^\\.\\./reviewer-core/'] },
    exclude: { path: ['^src/vendor/', '^src/db/migrations/'] },
    // Keep pnpm symlink paths (no `.pnpm/<pkg>@<version>/`) — readable output, simple patterns.
    preserveSymlinks: true,
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
