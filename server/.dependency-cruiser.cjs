/**
 * Architecture rules for server/src — Onion Architecture.
 *
 * Rules and rationale: .claude/skills/onion-architecture/SKILL.md
 * Run: pnpm arch
 *
 * Every rule starts at "warn" while the existing violations are worked off.
 * Flip a rule to "error" the moment its count reaches zero, so it can never
 * regress — and update the violation catalogue in the skill's README.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'Circular imports break module init order and defeat reasoning. ' +
        '5 cycles exist today; 4 of them run through platform/container.ts and ' +
        'disappear when no-container-in-services is fixed.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-depends-on-nothing',
      comment:
        'The domain ring may not import application or infrastructure. ' +
        'Dependencies point inward only.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/(adapters|platform|db|modules)/' },
    },
    {
      name: 'routes-are-adapters',
      comment:
        'routes.ts is an HTTP adapter: parse, call one service method, respond. ' +
        'A query in a route means the module is missing a service method.',
      severity: 'error',
      from: { path: 'routes\\.ts$' },
      to: { path: '^src/db/|^drizzle-orm' },
    },
    {
      name: 'no-container-in-services',
      comment:
        'Inject the ports the service actually uses. Depending on the container ' +
        'hides dependencies and points outward at the composition root.',
      severity: 'error',
      from: { path: '^src/modules/.+/service\\.ts$' },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'db-only-in-repositories',
      comment:
        'Persistence access belongs in a repository. Other module files go ' +
        'through one — including row types, which must not reach business ' +
        'logic. routes.ts has its own rule.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: 'repository\\.ts$|/repository/|\\.repo\\.ts$|^src/modules/.+/routes\\.ts$',
      },
      to: { path: '^src/db/' },
    },
    {
      name: 'no-cross-module',
      comment:
        'Modules compose in the container, not by importing each other. ' +
        '_shared is exempt.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/.+' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: '^src/modules/$1/.+|^src/modules/_shared/.+',
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '^src/vendor/', // vendored copies — not ours to restructure
        '\\.test\\.ts$', // tests legitimately reach across rings
      ].join('|'),
    },
    // Required: without this, `import type` edges are invisible and type-only
    // violations pass silently.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
};
