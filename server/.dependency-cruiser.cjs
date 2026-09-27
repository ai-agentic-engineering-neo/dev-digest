/**
 * Architecture rules — Onion / ports & adapters.
 * Rationale, layer map and migration phases: `.claude/skills/onion-architecture/`.
 *
 * Severities are a ladder: a rule starts at `warn` while the tree still violates it
 * and flips to `error` once its count reaches zero. All rules are at `error` — the
 * tree is clean, so any new violation fails CI rather than adding to a backlog.
 * Run `pnpm arch:check`.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */

/**
 * Who may speak SQL. The db layer and a module's repository, plus three
 * components that ARE the persistence edge rather than users of it:
 *
 *  - `src/app.ts` — the composition root's boot probe (`select 1`).
 *  - `src/platform/jobs.ts` — JobRunner owns the `jobs` table; it is that
 *    capability's data layer, a repository under another name.
 *  - `src/adapters/auth/local.ts` — a driven adapter (`implements AuthProvider`)
 *    whose storage happens to be the DB. That is what a driven adapter is.
 *
 * Each exception is named, never a directory wildcard: a new file cannot
 * inherit one by being dropped in the right folder.
 */
const PERSISTENCE_OWNERS =
  '^(src/db/|src/modules/[^/]+/repository(\\.ts|/)|src/app\\.ts$|src/platform/jobs\\.ts$|src/adapters/auth/local\\.ts$)';

module.exports = {
  forbidden: [
    {
      name: 'drizzle-only-in-repositories',
      comment:
        'Only src/db/** and a module repository may build SQL. Move the query behind a repository port.',
      severity: 'error',
      from: { path: '^src/', pathNot: PERSISTENCE_OWNERS },
      to: { dependencyTypes: ['npm'], path: 'node_modules/(drizzle-orm|postgres)' },
    },
    {
      name: 'schema-only-in-repositories',
      comment:
        'The Drizzle schema is an implementation detail of the data layer, not a shared type source.',
      severity: 'error',
      from: { path: '^src/', pathNot: PERSISTENCE_OWNERS },
      to: { path: '^src/db/schema' },
    },
    {
      // The graph sees imports, not signatures, so this checks the boundary that
      // is checkable: a row type must not reach the transport layer. "No row type
      // in a public service signature" stays a review rule — see
      // .claude/skills/onion-architecture/SKILL.md § Pre-flight checklist.
      name: 'no-row-types-in-transport',
      comment:
        'src/db/rows.ts is $inferSelect. A route that names a row type is coupled to the column layout.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/db/rows\\.ts$' },
    },
    {
      name: 'no-domain-to-infra',
      comment: 'The core stays pure: no transport, no persistence, no SDKs, no node builtins.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: {
        path: '(node_modules/(fastify|drizzle-orm|postgres|octokit|simple-git|openai|@anthropic-ai|@ast-grep)|^node:|^src/db/)',
      },
    },
    {
      name: 'no-adapter-to-module',
      comment: 'Adapters are outer: they may not depend on feature modules.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      comment: "Import another module's service or port, never its repository/helpers.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/(?!$1)[^/]+/(repository|helpers)' },
    },
    {
      // reviewer-core is compiled from source through a tsconfig path alias, so its
      // modules are already in this graph — no second config and no extra dependency.
      name: 'core-purity',
      comment:
        'reviewer-core is the core ring: no DB, transport, filesystem or process. Its only allowed server import is src/vendor/shared — the Zod contracts it compiles against.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: '(node_modules/(fastify|drizzle-orm|postgres|octokit|simple-git|@ast-grep)|^node:(fs|child_process|net|http|https|dns)|^src/(?!vendor/shared))',
      },
    },
    {
      name: 'core-llm-sdk-stays-in-llm-folder',
      comment:
        'Only reviewer-core/src/llm/** may touch a provider SDK; the rest of the engine talks to LLMProvider.',
      severity: 'error',
      from: {
        path: '^\\.\\./reviewer-core/src/',
        pathNot: '^\\.\\./reviewer-core/src/llm/',
      },
      to: { path: 'node_modules/(openai|@anthropic-ai)' },
    },
    {
      name: 'no-service-to-container',
      comment:
        'A use case takes named ports, not the composition root. Declare the slice it needs (see modules/reviews/deps.ts).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(service|deps)\\.ts$' },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'no-circular',
      comment: 'A cycle means two things that should be one, or a missing port.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(test|dist|clones)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    // This package is ESM: `service.ts` imports `./service.js`. Without this the
    // local graph resolves to nothing and every rule passes vacuously.
    tsPreCompilationDeps: true,
  },
};
