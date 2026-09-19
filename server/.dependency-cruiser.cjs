/**
 * Onion Architecture enforcement (server + reviewer-core).
 *
 * See `.claude/skills/onion-architecture/SKILL.md` for the ring model this
 * config checks. Run with `pnpm arch` (ignores the baselined violations in
 * `.dependency-cruiser-known-violations.json`) or `pnpm arch:baseline` to
 * regenerate that baseline after a deliberate, reviewed change.
 *
 * Never regenerate the baseline to make a NEW violation pass — fix the
 * import instead. The baseline exists only to freeze violations that
 * predate this config, so `pnpm arch` can be green on day one.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-db-outside-infra',
      severity: 'error',
      comment:
        'Onion: Drizzle (drizzle-orm, src/db/schema*, src/db/client.ts) is an ' +
        'Infrastructure-ring detail. Only a module\'s own repository.ts (or its ' +
        'repository/*.repo.ts files) may import it — service.ts/routes.ts/helpers.ts ' +
        'go through the repository instead of touching SQL directly. ' +
        'src/db/rows.ts is a deliberate, narrower exception: it holds ONLY Drizzle- ' +
        'inferred row *types* (`typeof table.$inferSelect`), by design, so cross-cutting ' +
        'Application-ring code (e.g. reviews/service.ts, run-executor.ts) can type a ' +
        'repository result without importing the schema/drizzle-orm value dependency ' +
        '(see the docblock in src/db/rows.ts). We therefore only forbid a VALUE import ' +
        'of rows.ts from outside a repository (`dependencyTypesNot: [\'type-only\']`) — ' +
        '`import type { FooRow } from \'.../db/rows.js\'` stays allowed everywhere; ' +
        '`import { AgentRow }` (or importing it for its runtime side effects) is not.',
      from: {
        path: '^src/modules/',
        pathNot: ['repository\\.ts$', '/repository/'],
      },
      to: {
        path: '(^|/)node_modules/drizzle-orm(/|$)|^src/db/(schema|client|rows)(\\.ts$|/)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'routes-thin',
      severity: 'error',
      comment:
        'Onion: a route handler is Presentation ring — parse (Zod) → getContext → ' +
        'call service.ts → status. It never talks to Drizzle, the db package, or an ' +
        'adapter directly; that belongs to Application (service.ts) and Infrastructure ' +
        '(repository.ts / src/adapters/**), which the route reaches only through its ' +
        "module's service.",
      from: {
        path: '^src/modules/.*routes\\.ts$',
      },
      to: {
        path: '(^|/)node_modules/drizzle-orm(/|$)|^src/db/|^src/adapters/',
      },
    },
    {
      name: 'domain-pure',
      severity: 'error',
      comment:
        'Onion: model.ts/helpers.ts/constants.ts (a module\'s pure domain rules) and ' +
        'vendor/shared (the cross-package contracts + ports) are the center of the ' +
        'onion — they must stay true with no HTTP, no DB and no network. They may not ' +
        'import Fastify, Drizzle, an adapter, src/db, or the composition root ' +
        '(platform/container.ts), all of which are outer-ring details.',
      from: {
        path: '^src/modules/[^/]+/(model|helpers|constants)\\.ts$|^src/vendor/shared/',
      },
      to: {
        path:
          '(^|/)node_modules/(fastify|drizzle-orm)(/|$)|^src/adapters/|^src/platform/container|^src/db/',
      },
    },
    {
      name: 'sdk-only-in-adapters',
      severity: 'error',
      comment:
        'Onion: raw external SDKs (openai, @anthropic-ai/sdk, octokit, simple-git, ' +
        '@vscode/ripgrep, @ast-grep/napi, js-tiktoken, dependency-cruiser) ' +
        'are Infrastructure-ring details. Every module reaches them ' +
        'through a port (vendor/shared/adapters.ts) implemented in src/adapters/**, or ' +
        'via the composition root (platform/container.ts) that wires the adapter in — ' +
        'never by importing the SDK package itself. reviewer-core/src/llm/ is the one ' +
        'documented exception (openrouter.ts wraps the openai SDK directly, per its own ' +
        'CLAUDE.md); reviewer-core has no server dependency to inject a port through.',
      from: {
        path: '^(?!src/adapters/).+',
        pathNot: '\\.\\./reviewer-core/src/llm/',
      },
      to: {
        path:
          '(^|/)node_modules/(openai|@anthropic-ai/sdk|octokit|simple-git|@vscode/ripgrep|@ast-grep/napi|js-tiktoken|dependency-cruiser)(/|$)',
      },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'Onion (sliced): module A reaches module B only through B\'s index.ts (its ' +
        'public surface) or through the composition root\'s shared facades ' +
        '(container.agentsRepo, container.reviewRepo, container.repoIntel, …) — never ' +
        "by importing another module's repository.ts, service.ts, constants.ts, etc. " +
        'directly. _shared/ is the one folder every module may reach into, since it ' +
        'holds code no single module owns. src/modules/index.ts (the module registry) ' +
        'is exempt: it is the one file whose job is wiring every module\'s routes.ts ' +
        'together, and it is not itself a module.',
      from: {
        path: '^src/modules/([^/]+)/',
        pathNot: '^src/modules/index\\.ts$',
      },
      to: {
        path: '^src/modules/(?!$1/|_shared/)[^/]+/',
        pathNot: '^src/modules/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'no-import-app-entry',
      severity: 'error',
      comment:
        'Onion: src/app.ts (Fastify app assembly) and src/server.ts (process entry) ' +
        'are the outermost composition layer. Nothing should import them back in — ' +
        'server.ts is the one legitimate entry point that boots app.ts; every other ' +
        'consumer (tests included — they live outside src/) should build what it needs ' +
        'from platform/container.ts or src/modules directly instead of re-importing the ' +
        'whole app entry point.',
      from: {
        pathNot: '^src/server\\.ts$',
      },
      to: {
        path: '^src/(app|server)\\.ts$',
      },
    },
    {
      name: 'reviewer-core-pure',
      severity: 'error',
      comment:
        'reviewer-core is a pure review-engine library (no HTTP/DB — see its ' +
        'CLAUDE.md): it must not depend on Fastify, Drizzle, postgres, or anything in ' +
        "server/src. A capability it needs from the host (token counting, an LLM call) " +
        'is a port it defines itself (e.g. `Tokenizer`) and receives as a parameter; ' +
        'the server passes its own adapter in. This keeps reviewer-core runnable and ' +
        'testable with no server process behind it. ' +
        'Exception: src/vendor/shared/ is exempt. reviewer-core/tsconfig.json maps ' +
        '`@devdigest/shared` straight to `../server/src/vendor/shared/index.ts` — per ' +
        "the root CLAUDE.md, that path alias (not a published/workspace package) IS the " +
        "documented mechanism for sharing the wire contracts (Zod schemas) between " +
        'packages, exactly like `@devdigest/reviewer-core` is server\'s. Every non-test ' +
        'reviewer-core file importing it (run.ts, reduce.ts, prompt.ts, to-review.ts, ' +
        'openrouter.ts, grounding.ts) uses it only for contract TYPES, never for a ' +
        'server business module — so this is the intended seam, not a leak, and ' +
        'flagging it would fight the codebase\'s own convention rather than protect it.',
      from: {
        path: '^\\.\\./reviewer-core/src/',
      },
      to: {
        path: '(^|/)node_modules/(fastify|drizzle-orm|postgres)(/|$)|^src/',
        pathNot: '^src/vendor/shared/',
      },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'Circular imports make the dependency direction (and the ring model) hard to ' +
        'reason about. Not auto-fixed here — this codebase already has cycles; ' +
        "kept at 'warn' so `pnpm arch` doesn't fail on pre-existing ones while still " +
        'surfacing the count. See the architecture report for the current tally.',
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '^dist(/|$)|^src/db/migrations(/|$)',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default', 'types'],
    },
  },
};
