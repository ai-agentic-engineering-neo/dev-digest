/**
 * Architecture rules for @devdigest/api, enforced mechanically.
 *
 * These are the graph-shaped rules ESLint's `no-restricted-imports` cannot
 * express (it sees one file at a time). Layer-direction rules that ARE
 * expressible per-file live in eslint.config.mjs instead.
 *
 * Source: .claude/skills/onion-architecture/SOURCES.md §9.1 (dependencies point
 * inward), §9.5 (package by feature, layer inside), and the rule stated in
 * platform/container.ts — cross-module data access goes through the container,
 * never by reaching into another module's folder.
 *
 * NOTE: dependency-cruiser is a runtime dependency here (it backs the repo-intel
 * depgraph adapter), so this config adds no new install cost.
 *
 * Run: pnpm arch
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means the layer boundary leaks in both directions. Extract the shared piece instead.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A module must not reach into another module's behaviour (service / repository / routes / " +
        'helpers). Cross-module data access goes through the container — see platform/container.ts. ' +
        "A module's `constants.ts` and `types.ts` are its published surface and stay importable.",
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/(?!_shared/)([^/]+)/(service|repository|routes|helpers|run-executor|diff-loader|findings|status)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'transport-never-queries',
      severity: 'error',
      comment:
        'A route handler parses, resolves context, delegates and maps — it does not issue queries. ' +
        "Move the query into the module's repository.ts (or reach a shared one through the " +
        'container) and call it from a service. See onion-architecture SKILL.md § Thin Routes.\n' +
        'Reaching the SCHEMA is the half caught here; the companion ban on importing `drizzle-orm` ' +
        'itself lives in eslint.config.mjs, because `exclude` keeps node_modules out of this graph.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/db/schema' },
    },
    {
      name: 'adapters-stay-outermost',
      severity: 'error',
      comment:
        'Infrastructure is the outermost ring: an adapter must not depend on application code. ' +
        "Importing another module's constants is tolerated; importing its behaviour is not.",
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/(?!.*(constants|types)\\.ts$)' },
    },
    {
      name: 'engine-stays-pure',
      severity: 'error',
      comment:
        'reviewer-core is the domain core: it may read the shared contracts (its @devdigest/shared ' +
        'alias points at server/src/vendor/shared) but must never import server application code. ' +
        'See reviewer-core/CLAUDE.md.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'no-unresolvable-local',
      severity: 'error',
      comment:
        "A relative import that doesn't resolve is a typo or a missing .js extension (this package " +
        'is ESM — see server/CLAUDE.md). Scoped to local paths on purpose: dependency-cruiser cannot ' +
        "resolve some ESM-only packages (p-queue, octokit) that are installed and work fine.",
      from: {},
      to: { couldNotResolve: true, path: '^[.]' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // The server consumes reviewer-core and the contracts through tsconfig
    // path aliases; without this the graph is full of unresolvable imports.
    tsConfig: { fileName: 'tsconfig.json' },
    // The RUNTIME graph, not the type graph. Services take `import type
    // { Container }` from the composition root, which is erased at compile time
    // and creates no coupling — counting those edges reports type-only cycles
    // (container → repo-intel/service → container) that do not exist at runtime.
    // The trade-off: a type-only reach into another module is not caught here.
    tsPreCompilationDeps: false,
    exclude: {
      path: '(^|/)node_modules/|^src/db/migrations/',
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
