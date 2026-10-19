/**
 * Onion-architecture boundary rules for server/src.
 * Skill + rationale: .claude/skills/onion-architecture/SKILL.md
 *
 *   pnpm arch:check     — fails on NEW violations (known ones are baselined)
 *   pnpm arch:baseline  — re-snapshot known violations (only after FIXING legacy,
 *                         never to silence new code). Baseline entries embed the
 *                         resolved npm path (e.g. drizzle-orm@0.38.4) — after a
 *                         dependency bump, re-run it if old violations resurface.
 *
 * Layers inside a module (src/modules/<m>/):
 *   domain.ts | domain/**          pure model + invariants        (innermost)
 *   ports.ts                       interfaces the service needs
 *   service.ts | *.service.ts      application / use cases
 *   repository*  | *.repo.ts       outbound adapter (Drizzle)
 *   routes.ts                      inbound adapter (Fastify)
 *   compose.ts                     module composition root (only place, besides
 *                                  routes, that reads the Container)
 */

/** Modules' layer-file patterns (paths are relative to server/). */
const MOD = '^src/modules/[^/]+/';
const DOMAIN = `${MOD}(domain\\.ts$|domain/)`;
const PORTS = `${MOD}ports\\.ts$`;
const SERVICE = `${MOD}(service\\.ts$|[^/]+\\.service\\.ts$)`;
const REPOSITORY = `${MOD}(repository\\.ts$|repository/|[^/]+\\.repo\\.ts$|mappers\\.ts$)`;
const ROUTES = `${MOD}routes\\.ts$`;
const COMPOSE = `${MOD}(compose\\.ts$|index\\.ts$)`;

/** Infrastructure that only outer rings may touch. */
const DB = ['^src/db/', 'drizzle-orm', '^postgres$', 'node_modules/postgres/'];
const HTTP = ['fastify', '@fastify/'];
const SDK = ['octokit', '@octokit/', 'openai', '@anthropic-ai/', 'simple-git', '@ast-grep/', '@vscode/ripgrep'];
const CONCRETE = ['^src/adapters/', '^src/platform/container\\.ts$'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'Domain (domain.ts / domain/**) is the core: no DB, HTTP, zod, SDKs, adapters, container or other modules. ' +
        'Types from @devdigest/shared are allowed as type-only imports.',
      from: { path: '^src/modules/([^/]+)/(domain\\.ts$|domain/)' },
      to: {
        path: [...DB, ...HTTP, ...SDK, ...CONCRETE, '^zod$', 'node_modules/zod/', '^src/platform/', '^src/modules/'],
        // own module's domain + constants/types files are fine
        pathNot: ['^src/modules/$1/(domain\\.ts$|domain/|constants\\.ts$|types\\.ts$)'],
      },
    },
    {
      name: 'domain-contracts-type-only',
      severity: 'error',
      comment:
        'Domain may reuse wire types from @devdigest/shared (`import type`), but never runtime zod schemas — parsing belongs at the edge.',
      from: { path: DOMAIN },
      to: { path: '^src/vendor/shared/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'ports-are-pure',
      severity: 'error',
      comment: 'ports.ts declares interfaces owned by the application — it must not depend on any implementation.',
      from: { path: PORTS },
      to: { path: [...DB, ...HTTP, ...SDK, ...CONCRETE] },
    },
    {
      name: 'service-no-infrastructure',
      severity: 'error',
      comment:
        'Application services depend on ports, never on Drizzle/db, Fastify, SDKs or concrete adapters. ' +
        'Get collaborators via the constructor (wired in compose.ts), not by importing them.',
      from: { path: SERVICE },
      to: { path: [...DB, ...HTTP, ...SDK, '^src/adapters/'] },
    },
    {
      name: 'service-no-container',
      severity: 'error',
      comment:
        'Passing the whole Container into a service is a service locator. Inject narrow deps; only compose.ts / routes.ts read the Container.',
      from: { path: SERVICE },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'service-no-concrete-repository',
      severity: 'error',
      comment:
        'A service must not import its repository implementation (it would `new` it). Depend on the port in ports.ts; compose.ts injects the impl. ' +
        'Type-only imports of row types are also forbidden — repositories return domain/read models.',
      from: { path: SERVICE },
      to: { path: REPOSITORY },
    },
    {
      name: 'drizzle-only-in-repositories',
      severity: 'error',
      comment:
        'Inside modules, drizzle-orm and src/db/** are allowed only in repository/mapper files. Routes, services and helpers go through a repository.',
      from: { path: MOD, pathNot: [REPOSITORY] },
      to: { path: DB },
    },
    {
      name: 'fastify-only-in-routes',
      severity: 'error',
      comment: 'Fastify types/objects stay in the inbound adapter (routes.ts) and the shared request-context helper.',
      from: { path: MOD, pathNot: [ROUTES, '^src/modules/_shared/'] },
      to: { path: HTTP, pathNot: ['^src/'] },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A module must not import another module's repository/service/routes internals. Use the provider's facade via the Container, " +
        'its constants/types files, or move the shared piece to src/modules/_shared.',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/_shared/' },
      to: {
        path: '^src/modules/[^/]+/(repository|service|routes|run-executor|compose|[^/]+\\.repo\\.ts|[^/]+\\.service\\.ts)',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'adapters-know-no-modules',
      severity: 'error',
      comment: 'Outbound adapters implement ports; they must not depend on feature modules or the container.',
      from: { path: '^src/adapters/' },
      to: { path: ['^src/modules/', '^src/platform/container\\.ts$'] },
    },
    {
      name: 'modules-no-concrete-adapters',
      severity: 'error',
      comment:
        'Modules use adapters through their port interfaces (@devdigest/shared or a module port). Only the composition root (platform/container.ts) imports concrete adapters.',
      from: { path: MOD, pathNot: [COMPOSE] },
      to: { path: '^src/adapters/', pathNot: ['^src/adapters/mocks\\.ts$'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^\\.\\./reviewer-core'] },
    exclude: { path: ['^src/db/migrations/'] },
    // See type-only imports too: `import type { Container }` is still coupling.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
