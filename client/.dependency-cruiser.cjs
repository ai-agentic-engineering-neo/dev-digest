/**
 * Frontend architecture enforcement (client).
 *
 * See `.claude/skills/frontend-ui-architecture/SKILL.md` for the placement
 * rules this config checks (shared → features → app, no sibling-route
 * imports, vendor stays a leaf). Run with `pnpm arch` (ignores the
 * baselined violations in `.dependency-cruiser-known-violations.json`) or
 * `pnpm arch:baseline` to regenerate that baseline after a deliberate,
 * reviewed change.
 *
 * Never regenerate the baseline to make a NEW violation pass — fix the
 * import instead. The baseline exists only to freeze violations that
 * predate this config, so `pnpm arch` can be green on day one.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'shared-not-importing-app',
      severity: 'error',
      comment:
        'Frontend architecture: src/lib/** and src/components/** are the shared ' +
        "layer — they must not import src/app/**. If shared code needs a route's " +
        "code, that's a promotion signal: the piece isn't actually shared yet, or " +
        "the route-local piece needs to move down into lib/ or components/ instead.",
      from: {
        path: '^src/(lib|components)/',
      },
      to: {
        path: '^src/app/',
      },
    },
    {
      name: 'no-cross-route-internals',
      severity: 'error',
      comment:
        "Frontend architecture: a route's private folders (_components/, _lib/) are " +
        "for that route subtree only. This rule encodes the practical case dependency-" +
        "cruiser can check directly — one top-level route importing a sibling top-level " +
        "route's _components/_lib (e.g. app/(shell)/agents/** importing " +
        "app/(shell)/repos/**/_components/**) — by name-matching the four current top-" +
        'level routes (agents, repos, settings, onboarding) via a capture group. It does ' +
        "NOT verify true ancestor/descendant relationships within a route subtree (e.g. " +
        "pulls/[number] reaching into pulls/_components is allowed here because both " +
        "share the 'repos' top-level segment, even though pulls/[number] is not a direct " +
        "parent of pulls/_components — dependency-cruiser regexes can't express " +
        "'ancestor'). A new top-level route folder must be added to both lists below or " +
        'it silently falls outside this rule.',
      from: {
        path: '^src/app/(?:\\(shell\\)/)?(agents|repos|settings|onboarding)/',
      },
      to: {
        path:
          '^src/app/(?:\\(shell\\)/)?(?!$1/)(agents|repos|settings|onboarding)/.*(_components|_lib)/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular imports make the dependency direction (shared → features → app) ' +
        'hard to reason about.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        "A module nothing imports, that itself imports nothing local (per " +
        "dependency-cruiser's definition: zero incoming AND zero outgoing " +
        'dependencies). This is what would have caught the dead mermaid-diagram ' +
        'component. Route files Next.js loads by convention, the i18n request ' +
        'config, next.config.mjs, the test setup file, and src/vendor/** (hand-' +
        'duplicated, not meant to be imported from inside this package) are excluded ' +
        "because Next.js/vitest reach them by filename, not by import.",
      from: {
        orphan: true,
        pathNot: [
          '(^|/)page\\.tsx$',
          '(^|/)layout\\.tsx$',
          '(^|/)error\\.tsx$',
          '(^|/)not-found\\.tsx$',
          '(^|/)loading\\.tsx$',
          '(^|/)route\\.ts$',
          '^src/i18n/request\\.ts$',
          '^next\\.config\\.mjs$',
          '^src/test/setup\\.ts$',
          '^src/vendor/',
        ],
      },
      to: {},
    },
    {
      name: 'vendor-is-leaf',
      severity: 'error',
      comment:
        'Frontend architecture: src/vendor/** (shared/, ui/) is hand-duplicated with ' +
        'server/ per the root CLAUDE.md — it must stay independent of this app so the ' +
        'two copies can be diffed and kept in sync. It may not import src/app/, ' +
        'src/lib/ or src/components/.',
      from: {
        path: '^src/vendor/',
      },
      to: {
        path: '^src/(app|lib|components)/',
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
      path: '^\\.next(/|$)',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default', 'types'],
    },
  },
};
