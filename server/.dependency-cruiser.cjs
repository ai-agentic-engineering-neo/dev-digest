/**
 * Onion Architecture guard for server/ + reviewer-core/ (skill: .claude/skills/onion-architecture).
 * Run: `cd server && pnpm arch:check`.
 *
 * Rings (inner → outer), per module `src/modules/<m>/`:
 *   domain-model/ → domain-services/ → application-services/ → infrastructure/ + routes.ts (UI)
 * Rule: code may depend only on rings closer to the centre.
 *
 * All rules are `warn` for now (adoption phase): the command reports but never fails.
 * Flip a rule to `error` once its violation count reaches zero.
 */

const MOD = '^src/modules/[^/]+';
const DRIZZLE = '^(drizzle-orm|postgres)(/|$)|node_modules/(drizzle-orm|postgres)/';
const DB = '^src/db/';
const SDKS =
  'node_modules/(octokit|@octokit|openai|@anthropic-ai/sdk|simple-git|@vscode/ripgrep|@ast-grep/napi|js-tiktoken|dependency-cruiser)/';
const FRAMEWORK = 'node_modules/(fastify|@fastify|fastify-[^/]+)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Centre: domain-model depends on nothing but itself ────────────────
    {
      name: 'domain-model-is-pure',
      comment:
        'Runtime imports in domain-model/ only from domain-model/. No framework, ORM, SDK, Zod schemas, container or outer rings.',
      severity: 'warn',
      from: { path: `${MOD}/domain-model/` },
      to: {
        // platform/errors.ts is the shared kernel: zero imports, AppError subclasses only.
        pathNot: [`${MOD}/domain-model/`, '^src/platform/errors\\.ts$'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domain-model-no-outer-types',
      comment:
        'Type-only imports allowed only for shared enum-like types (`import type { Severity } from "@devdigest/shared"`); types from outer rings leak their formats into the centre.',
      severity: 'warn',
      from: { path: `${MOD}/domain-model/` },
      to: {
        path: [`${MOD}/(domain-services|application-services|infrastructure)/`, `${MOD}/routes\\.ts$`, DB, '^src/platform/(?!errors\\.ts$)', '^src/adapters/', DRIZZLE, FRAMEWORK],
        dependencyTypes: ['type-only'],
      },
    },
    // ── Domain services: model + own ports only ───────────────────────────
    {
      name: 'domain-services-inward-only',
      severity: 'warn',
      from: { path: `${MOD}/domain-services/` },
      to: {
        path: [`${MOD}/(application-services|infrastructure)/`, `${MOD}/routes\\.ts$`, DB, '^src/platform/container', '^src/adapters/', DRIZZLE, FRAMEWORK, SDKS],
      },
    },
    // ── Application services: orchestrate via ports, never concrete infra ─
    {
      name: 'application-services-no-infra',
      comment:
        'Use cases depend on ports (domain-services/ports.ts, @devdigest/shared interfaces), injected via constructor — not on Drizzle, db/, adapters/ or the Container.',
      severity: 'warn',
      from: { path: `${MOD}/application-services/` },
      to: {
        path: [`${MOD}/infrastructure/`, `${MOD}/routes\\.ts$`, DB, '^src/platform/container', '^src/adapters/', DRIZZLE, FRAMEWORK, SDKS],
      },
    },
    // ── Infrastructure never reaches the UI ring ──────────────────────────
    {
      name: 'infrastructure-no-ui',
      severity: 'warn',
      from: { path: `${MOD}/infrastructure/` },
      to: { path: [`${MOD}/routes\\.ts$`, FRAMEWORK] },
    },
    // ── UI ring (routes.ts): transport only ───────────────────────────────
    {
      name: 'routes-no-persistence',
      comment: 'routes.ts must go through a service/use case; Drizzle and db/schema belong in the repository (infrastructure).',
      severity: 'warn',
      from: { path: `${MOD}/routes\\.ts$` },
      to: { path: [DRIZZLE, DB, `${MOD}/(repository|infrastructure)`] },
    },
    // ── Legacy layout (routes/service/repository) — until a module migrates
    {
      name: 'legacy-service-no-drizzle',
      comment: 'Legacy service.ts: persistence goes through repository.ts.',
      severity: 'warn',
      from: { path: `${MOD}/service\\.ts$` },
      to: { path: [DRIZZLE, '^src/db/schema'] },
    },
    {
      name: 'drizzle-only-in-persistence',
      comment: 'Drizzle may be imported only by repositories / infrastructure / src/db (routes.ts is covered by routes-no-persistence).',
      severity: 'warn',
      from: {
        path: '^src/modules/',
        pathNot: [`${MOD}/(repository|infrastructure)(\\.ts$|/)`, `${MOD}/routes\\.ts$`, '\\.test\\.ts$'],
      },
      to: { path: DRIZZLE, dependencyTypesNot: ['type-only'] },
    },
    // ── External SDKs live only in adapters (outer ring) ──────────────────
    {
      name: 'sdk-only-in-adapters',
      comment: 'Octokit, OpenAI, Anthropic, simple-git, ripgrep… only in src/adapters/** behind a port from @devdigest/shared.',
      severity: 'warn',
      from: { path: '^src/', pathNot: ['^src/adapters/', '\\.test\\.ts$'] },
      to: { path: SDKS },
    },
    // ── reviewer-core: pure engine; openai only in its LLM adapter ────────
    {
      name: 'reviewer-core-no-io',
      comment: 'reviewer-core is the review core: no fs/net/process/DB/server imports.',
      severity: 'warn',
      from: { path: 'reviewer-core/src/' },
      to: {
        path: [
          '^(node:)?(fs|fs/promises|child_process|net|http|https|worker_threads)$',
          DRIZZLE,
          '(^|/)server/src/(?!vendor/shared)',
          FRAMEWORK,
        ],
      },
    },
    {
      name: 'reviewer-core-sdk-only-in-llm-adapter',
      severity: 'warn',
      from: { path: 'reviewer-core/src/', pathNot: ['reviewer-core/src/llm/', '\\.test\\.ts$'] },
      to: { path: 'node_modules/openai/' },
    },
    // ── Hygiene ───────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      severity: 'warn',
      from: { path: '^src/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^src/db/migrations/', '/dist/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
