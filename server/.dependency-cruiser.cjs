/**
 * Onion Architecture boundaries for @devdigest/api — the machine-checkable half
 * of the `onion-architecture` skill (`.claude/skills/onion-architecture/`).
 *
 * Run: `pnpm arch`
 *
 * Rings (inner → outer). A module may only import from its own ring or inward:
 *
 *   L0 core      src/vendor/shared               contracts + port interfaces
 *                src/modules/<name>/helpers|status|findings.ts, src/platform/grounding.ts
 *   L2 services  src/modules/<name>/service.ts, run-executor.ts, repo-intel/pipeline
 *   L3 infra     src/adapters, src/db, src/modules/<name>/repository
 *   L4 root      src/platform/container.ts, src/app.ts
 *   L5 entry     src/modules/<name>/routes.ts, src/modules/index.ts
 *
 * `pathNot` allowlists carry today's known debt. Each one is listed in the
 * skill's "Known debt" section — do not add to them. Touch a listed file for
 * other reasons and the expectation is that you move its persistence into a
 * repository and delete the line.
 */

/** Files that query the DB outside a repository (known debt, 2026-09-18). */
const ORM_DEBT =
  '^src/modules/(pulls/routes|polling/routes|workspace/routes|settings/routes|settings/feature-models|repos/helpers|reviews/diff-loader|reviews/run-executor)\\.ts$';

/** Pure parsers/extractors that happen to live under adapters/ (no I/O). */
const PURE_ADAPTER_FNS = '^src/adapters/(git/diff-parser|codeindex/extract|astgrep/index)\\.ts$';

/**
 * Ports declared next to their implementation instead of in vendor/shared/adapters.ts
 * (`Tokenizer`, `DepGraph`). Importing the interface is inward-pointing and fine;
 * importing the class from these files is not, so keep this list short.
 */
const INLINE_PORTS = '^src/adapters/(tokenizer|depgraph)/index\\.ts$';

/**
 * Known cycle (2026-09-18): agents/helpers.ts takes its row types from
 * agents/repository.ts, which imports isConfigChange() back from helpers.
 * One-line fix when that file is next touched:
 * `import type { AgentRow } from '../../db/rows.js'`.
 */
const CYCLE_DEBT = '^src/modules/agents/(repository|helpers)\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'L0: contracts and port interfaces (vendor/shared) define the inside of the onion. ' +
        'They may not know about services, adapters, the DB or the HTTP layer.',
      severity: 'error',
      from: { path: '^src/vendor/shared/' },
      to: { path: '^src/(adapters|db|modules|platform)/' },
    },
    {
      name: 'pure-helpers-stay-pure',
      comment:
        'helpers.ts / status.ts / findings.ts are the functional core: pure transforms, ' +
        'hermetically testable. No DB, no ORM, no adapters, no container.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/(helpers|status|findings)\\.ts$',
        pathNot: ORM_DEBT,
      },
      to: {
        // db/rows.ts (row types inferred from the schema) is allowed — a mapper
        // needs the row shape. The schema itself, the client and the ORM are not.
        path: '^src/db/(schema|client)|^src/adapters/|^src/platform/container\\.ts$|node_modules/(drizzle-orm|postgres|fastify)/',
      },
    },
    {
      name: 'orm-only-in-repository',
      comment:
        'All persistence lives in repository.ts. A route or service that builds its own ' +
        'Drizzle query leaks the storage model into the outer rings and makes tenancy ' +
        'scoping invisible.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: ['repository', ORM_DEBT],
      },
      to: { path: '^src/db/(schema|client)|node_modules/(drizzle-orm|postgres)/' },
    },
    {
      name: 'http-framework-only-in-routes',
      comment:
        'Fastify types belong to the entry ring. A service or repository that imports ' +
        'fastify cannot be called from a job, a CLI or a test without an HTTP request.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: '^src/modules/([^/]+/routes\\.ts|index\\.ts|_shared/context\\.ts)$',
      },
      to: { path: 'node_modules/fastify' },
    },
    {
      name: 'no-concrete-adapter-in-modules',
      comment:
        'Take dependencies from the container, never import a concrete adapter class — ' +
        'otherwise tests cannot swap it through ContainerOverrides. Pure parsers under ' +
        'adapters/ are exempt (they are core code in the wrong folder).',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: {
        path: '^src/adapters/',
        pathNot: [PURE_ADAPTER_FNS, INLINE_PORTS, '^src/adapters/mocks\\.ts$'],
      },
    },
    {
      name: 'no-vendor-sdk-outside-adapters',
      comment:
        'A third-party client SDK is an implementation detail of one adapter. Modules ' +
        'talk to the port interface in vendor/shared/adapters.ts instead.',
      severity: 'error',
      from: { path: '^src/(modules|vendor)/' },
      to: {
        path: 'node_modules/(octokit|@octokit|openai|@anthropic-ai|simple-git|@ast-grep|dependency-cruiser)/',
      },
    },
    {
      name: 'no-cross-module-import',
      comment:
        'Modules are vertical slices. Shared entities come from the container ' +
        '(container.agentsRepo, container.reviewRepo); shared code goes to modules/_shared/.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/',
        pathNot: '^src/modules/repos/service\\.ts$',
      },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'no-circular',
      comment:
        'A cycle means two files are really one module — and it hides which ring owns the code. ' +
        'Cycles through the composition root are exempt: `import type { Container }` in a ' +
        'service, against a container that constructs that service, is intended.',
      severity: 'error',
      from: { pathNot: CYCLE_DEBT },
      to: {
        circular: true,
        // The composition root legitimately closes loops: it constructs a service
        // that imports `type { Container }` back. Cycles THROUGH it are not a smell.
        // `viaNot` = "no module in the cycle matches". Do not rewrite it as
        // `via: { pathNot: … }` — that reads "SOME module does not match", which
        // is true of almost every cycle and silently re-flags these four.
        viaNot: '^src/platform/container\\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Type-only imports count: `import type { Container }` is still a boundary crossing.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    // node_modules stays IN the graph (doNotFollow keeps it cheap) — the npm-package
    // rules below only fire if external dependencies are visible.
    exclude: { path: '(^|/)(clones|dist)/' },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
