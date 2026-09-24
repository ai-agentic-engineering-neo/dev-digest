/**
 * Onion Architecture dependency rules for server/ (+ reviewer-core as the inner core).
 * Rationale and ring map: .claude/skills/onion-architecture/SKILL.md
 *
 * Check (known legacy violations are baselined and ignored):
 *   pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --ignore-known
 * Re-baseline ONLY after fixing a legacy violation (never to hide a new one):
 *   pnpm exec depcruise-baseline src ../reviewer-core/src --config .dependency-cruiser.cjs
 */

// Rings by path. A module file's ring is its name (small module) or its folder (grown module).
// EVERY file under src/modules/<m>/ gets a ring — nothing is left unchecked:
//   domain          domain.ts helpers.ts constants.ts types.ts | domain/        (+ src/domain/)
//   application     service.ts | application/  + DEFAULT for any other name  (+ src/application/)
//   infrastructure  repository.ts | infrastructure/ | repository/            (+ src/adapters/, src/db/)
//   http            routes.ts | http/                                        (+ modules/_shared/, src/http/)
//   composition     composition.ts, index.ts (module wiring / public barrel) — ring rules don't apply
// So an unconventionally named file (run-executor.ts, pipeline/*) is held to the
// APPLICATION rules until it is renamed/moved into its real ring.
const M = '^src/modules/(?!_shared/)[^/]+/';
const DOMAIN_NAMES = 'domain|helpers|constants|types';
const INFRA_NAMES = 'repository|infrastructure';
const HTTP_NAMES = 'routes|http';
const COMPOSITION_NAMES = 'composition|index';
const NAMED = `${DOMAIN_NAMES}|service|application|${INFRA_NAMES}|${HTTP_NAMES}|${COMPOSITION_NAMES}`;

const DOMAIN = [`${M}(${DOMAIN_NAMES})(\\.ts$|/)`, '^src/domain/'];
const MODULE_APPLICATION = [`${M}(service|application)(\\.ts$|/)`, `${M}(?!(${NAMED})(\\.ts$|/))`];
const APPLICATION = [...MODULE_APPLICATION, '^src/application/'];
const MODULE_INFRASTRUCTURE = `${M}(${INFRA_NAMES})(\\.ts$|/)`;
const INFRASTRUCTURE = [MODULE_INFRASTRUCTURE, '^src/adapters/', '^src/db/'];
const MODULE_HTTP = `${M}(${HTTP_NAMES})(\\.ts$|/)`;
const HTTP = [MODULE_HTTP, '^src/modules/_shared/', '^src/http/'];

/** Any module file outside the domain ring (application, infrastructure, http, composition). */
const MODULE_OUTER = [...MODULE_APPLICATION, MODULE_INFRASTRUCTURE, MODULE_HTTP, `${M}composition\\.ts$`, '^src/modules/_shared/'];
const FRAMEWORKS =
  '(^|/)node_modules/(fastify|@fastify|fastify-[^/]+|drizzle-orm|postgres|openai|@anthropic-ai|octokit|@octokit|simple-git|@ast-grep|@vscode/ripgrep|js-tiktoken|p-queue)/';
const IO_CORE = ['fs', 'fs/promises', 'child_process', 'net', 'http', 'https', 'worker_threads'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain (domain.ts, helpers.ts, constants.ts, types.ts, src/domain/) may import only other domain code, @devdigest/shared, zod and platform/errors. No DB, adapters, frameworks, SDKs or I/O.',
      from: { path: DOMAIN },
      to: {
        path: [...MODULE_OUTER, '^src/application/', '^src/http/', '^src/db/', '^src/adapters/', '^src/platform/(?!errors\\.ts$)', FRAMEWORKS],
      },
    },
    {
      name: 'domain-no-io',
      severity: 'error',
      comment: 'domain must not do I/O (fs, child_process, network).',
      from: { path: DOMAIN },
      to: { dependencyTypes: ['core'], path: IO_CORE.map((m) => `^${m}$`) },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment:
        'use cases depend on ports (@devdigest/shared adapters or an interface in the application ring), not on Drizzle, db/, adapters/, SDKs or Fastify.',
      from: { path: APPLICATION },
      to: { path: ['^src/db/', '^src/adapters/', ...HTTP, FRAMEWORKS] },
    },
    {
      name: 'application-no-service-locator',
      severity: 'error',
      comment: 'inject the ports a use case needs; do not pass/import the whole Container.',
      from: { path: APPLICATION },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'application-repository-type-only',
      severity: 'error',
      comment:
        'pragmatic CRUD: a use case may reference its own module repository as a TYPE only; the instance is built in the composition root. Extract a port interface when invariants or a 2nd implementation appear.',
      from: {
        path: `^src/modules/((?!_shared/)[^/]+)/(?!(${DOMAIN_NAMES}|${INFRA_NAMES}|${HTTP_NAMES}|${COMPOSITION_NAMES})(\\.ts$|/))`,
      },
      to: {
        path: '^src/modules/$1/(repository|infrastructure)(\\.ts$|/)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'http-no-data-access',
      severity: 'error',
      comment: 'routes call use cases; they never touch Drizzle, db/, repositories or adapters directly.',
      from: { path: HTTP },
      to: {
        path: [
          '^src/db/',
          '^src/adapters/',
          MODULE_INFRASTRUCTURE,
          '(^|/)node_modules/(drizzle-orm|postgres|openai|@anthropic-ai|octokit|@octokit|simple-git)/',
        ],
      },
    },
    {
      name: 'infrastructure-no-http',
      severity: 'error',
      comment:
        'adapters and repositories must not depend on the HTTP ring or on use cases (they may implement application ports: src/application/, <module>/application/ports).',
      from: { path: INFRASTRUCTURE },
      to: { path: [...MODULE_APPLICATION, ...HTTP], pathNot: `${M}application/ports(\\.ts$|/)` },
    },
    {
      name: 'adapters-no-modules',
      severity: 'error',
      comment: 'shared adapters implement @devdigest/shared ports; they must not import feature modules.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "a module may use another module only through its index.ts / types.ts (or via ports wired in the composition root), never through its internals.",
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/($1|_shared)/', '^src/modules/[^/]+/(index|types)\\.ts$'],
      },
    },
    {
      name: 'reviewer-core-is-core',
      severity: 'error',
      comment:
        'reviewer-core is the inner ring: no server code (except the vendored contracts), no DB/framework, no I/O. Its only provider SDK use is the OpenRouter adapter in src/llm/.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [
          '^src/(?!vendor/shared/)',
          '(^|/)node_modules/(fastify|@fastify|drizzle-orm|postgres|@anthropic-ai|octokit|@octokit|simple-git)/',
        ],
      },
    },
    {
      name: 'reviewer-core-sdk-only-in-llm',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: { path: '(^|/)node_modules/openai/' },
    },
    {
      name: 'reviewer-core-no-io',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { dependencyTypes: ['core'], path: IO_CORE.map((m) => `^${m}$`) },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '^src/db/migrations/', '^src/vendor/ui/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
