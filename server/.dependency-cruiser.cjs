/**
 * Onion Architecture gate for server/ (and reviewer-core sources reached through the alias).
 * The rules encode the import table in .claude/skills/onion-architecture/SKILL.md.
 *
 * Run: test/architecture.test.ts (part of the unit suite → CI server-unit).
 * Manual: pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
 * Legacy violations are frozen in .dependency-cruiser-known-violations.json; regenerate it
 * ONLY after removing violations (never to hide new ones):
 *   pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs
 *
 * Paths are relative to server/. npm packages resolve through pnpm's store, so they are
 * matched by the "node_modules/<name>/" segment.
 */

const SDKS = '(octokit|@octokit|openai|@anthropic-ai|simple-git|@ast-grep|@vscode/ripgrep|js-tiktoken)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'modules/*/domain may import only domain code, modules/_shared/domain, and TYPES from @devdigest/shared.',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: {
        pathNot: ['^src/modules/[^/]+/domain/', '^src/vendor/shared/'],
      },
    },
    {
      name: 'domain-shared-types-only',
      severity: 'error',
      comment:
        'Domain may reuse @devdigest/shared vocabularies only via `import type` (the barrel and contracts are runtime Zod).',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/vendor/shared/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'application-no-outer-rings',
      severity: 'error',
      comment: 'Use cases depend on ports, not on Drizzle, Fastify, SDKs, adapters, the db or the Container.',
      from: { path: '^src/modules/[^/]+/application/' },
      to: {
        path: [
          '^src/modules/[^/]+/(infrastructure|http)/',
          '^src/(db|adapters)/',
          '^src/platform/',
          `node_modules/(drizzle-orm|fastify|postgres|zod|${SDKS})/`,
        ],
      },
    },
    {
      name: 'no-drizzle-outside-infrastructure',
      severity: 'error',
      comment:
        'drizzle-orm and db/schema belong to infrastructure: modules/*/infrastructure, legacy modules/*/repository(.ts|/), src/db, src/adapters, src/platform (container, jobs, …) and app.ts.',
      from: {
        path: '^src/',
        pathNot: [
          '^src/modules/[^/]+/infrastructure/',
          '^src/modules/[^/]+/repository(\\.ts$|/)',
          '^src/db/',
          '^src/adapters/',
          '^src/platform/',
          '^src/app\\.ts$',
        ],
      },
      to: { path: ['node_modules/drizzle-orm/', '^src/db/(schema|rows)'] },
    },
    {
      name: 'no-sdk-outside-adapters',
      severity: 'error',
      comment: 'External SDKs are used only behind a port, in src/adapters/**.',
      from: { path: '^src/', pathNot: '^src/adapters/' },
      to: { path: `node_modules/${SDKS}/` },
    },
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment: "A module never imports another module's folder; share via modules/_shared, a port, or container.*.",
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'adapters-no-modules',
      severity: 'error',
      comment: 'Adapters implement ports; they must not depend on feature modules.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-container-in-core',
      severity: 'error',
      comment: 'Service Locator: domain/application get narrow deps, never the Container.',
      from: { path: '^src/modules/[^/]+/(domain|application)/' },
      to: { path: '^src/platform/container' },
    },
    {
      name: 'reviewer-core-is-pure',
      severity: 'error',
      comment: 'reviewer-core has no DB, FS, process or HTTP-framework access; side effects come in as ports.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [
          'node_modules/(drizzle-orm|postgres|fastify|simple-git|octokit)/',
          '^(node:)?(fs|fs/promises|child_process)$',
          '^src/',
        ],
        // The one allowed edge into server/: the vendored contracts + port interfaces.
        pathNot: '^src/vendor/shared/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(src|\\.\\./reviewer-core/src)/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '^src/vendor/shared/.*\\.test\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
