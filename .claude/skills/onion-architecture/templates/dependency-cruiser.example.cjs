/**
 * TEMPLATE: onion-architecture dependency rules for server/.
 *
 * NOT WIRED. Do not copy this to server/ or add it to CI as part of the skill.
 * Enforcement is a separate task: migrate one module first, then record the
 * existing violations as a baseline so only NEW violations fail.
 *
 * Ad-hoc run (from server/):
 *   pnpm exec depcruise src --config ../.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs
 * Later, when enforcement lands:
 *   pnpm exec depcruise-baseline src --config <config>   → .dependency-cruiser-known-violations.json
 *   pnpm exec depcruise src --config <config> --ignore-known
 *
 * Paths are relative to server/. The SKILL.md section of each rule is in its comment.
 */

/**
 * Match a package under node_modules. Unanchored, so it also matches pnpm's
 * `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…` real paths. Kept free of
 * nested quantifiers: dependency-cruiser rejects "unsafe" regexes.
 */
const pkg = (...names) => `node_modules/(${names.join('|')})/`;

const SDKS = pkg(
  'openai',
  '@anthropic-ai/sdk',
  'octokit',
  '@octokit',
  'simple-git',
  '@vscode/ripgrep',
  '@ast-grep/napi',
  'js-tiktoken',
  'dependency-cruiser',
);
const DRIZZLE = pkg('drizzle-orm', 'postgres');
const FASTIFY = pkg('fastify', '@fastify', 'fastify-plugin', 'fastify-sse-v2', 'fastify-type-provider-zod');
const ZOD = pkg('zod');

const DOMAIN = '^src/modules/[^/]+/(domain\\.ts|domain/|status\\.ts)';
const APPLICATION = '^src/(application/|modules/[^/]+/(service\\.ts|ports\\.ts|run-executor\\.ts|application/))';
const REPOSITORY = '^src/modules/[^/]+/(repository\\.ts|repository/|[^/]+\\.repo\\.ts)';
const PRESENTATION = '^src/modules/[^/]+/(routes\\.ts|http/)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // §2: domain is pure. Type-only imports (import type, z.infer) are allowed.
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: DOMAIN },
      to: {
        path: [SDKS, DRIZZLE, FASTIFY, ZOD, '^src/db/', '^src/adapters/', '^src/platform/container\\.ts$', APPLICATION, REPOSITORY, PRESENTATION],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domain-no-io',
      severity: 'error',
      from: { path: DOMAIN },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|fs/promises|net|http|https|child_process)$' },
    },

    // §2, §10: application depends on ports, not on infrastructure or the container.
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      from: { path: APPLICATION },
      to: {
        path: [DRIZZLE, FASTIFY, SDKS, '^src/db/', '^src/adapters/', '^src/platform/container\\.ts$', REPOSITORY, PRESENTATION],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'application-no-row-types',
      severity: 'error',
      from: { path: APPLICATION },
      to: { path: '^src/db/' },
    },

    // §6: routes call services only.
    {
      name: 'routes-no-data-access',
      severity: 'error',
      from: { path: PRESENTATION },
      to: { path: [DRIZZLE, SDKS, '^src/db/', '^src/adapters/', REPOSITORY] },
    },

    // §8: Drizzle and src/db only in repositories (and src/db itself).
    {
      name: 'no-drizzle-outside-repositories',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: REPOSITORY },
      to: { path: [DRIZZLE, '^src/db/(schema|client|rows)\\.ts$'], dependencyTypesNot: ['type-only'] },
    },

    // §9: SDKs only inside their adapter.
    {
      name: 'no-sdk-outside-adapters',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/adapters/' },
      to: { path: SDKS },
    },

    // §5: adapters never reach into features, except the port file they implement.
    {
      name: 'adapters-no-modules',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/', pathNot: '(ports\\.ts|/application/ports\\.ts)$' },
    },

    // §3: no cross-module internals. Allowed: own module, _shared, repo-intel facade, port files.
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/index\\.ts$' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/repo-intel/index\\.ts$', 'ports\\.ts$'],
      },
    },

    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '^test/', '^clones/'] },
    // Needed so `import type` edges are visible and can be exempted via dependencyTypesNot.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
