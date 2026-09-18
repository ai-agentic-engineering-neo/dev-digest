/**
 * UI boundaries for @devdigest/web — the machine-checkable half of the
 * `frontend-ui-architecture` skill (`.claude/skills/frontend-ui-architecture/`).
 *
 * Run: `pnpm arch`
 *
 * The conventions being enforced are written in `client/CLAUDE.md` and
 * `client/docs/component-conventions.md`; until this file existed, nothing
 * checked them.
 *
 *   src/vendor/**      vendored design kit + shared contracts — the inside
 *   src/lib, components  shared layer: usable anywhere, knows nothing about routes
 *   src/app/**         routing + composition; `_components/` is private to its route
 *
 * Imports point inward: app → components/lib → vendor. Never the reverse.
 */
module.exports = {
  forbidden: [
    {
      name: 'shared-does-not-import-app',
      comment:
        'A module under src/components or src/lib is shared by definition. Importing a route ' +
        'pins it to a URL and makes it unmovable — lift what it needs into the shared layer, ' +
        'or pass it in as a prop.',
      severity: 'error',
      from: { path: '^src/(components|lib)/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'vendor-is-self-contained',
      comment:
        'src/vendor/** is vendored (the @devdigest/ui kit and the shared Zod contracts). ' +
        'It is the innermost ring: it may not reach back out into app code.',
      severity: 'error',
      from: { path: '^src/vendor/' },
      to: { path: '^src/(app|components|lib)/' },
    },
    {
      name: 'no-private-component-from-outside-app',
      comment:
        'A `_` prefix means private to its parent (root CLAUDE.md). Shared code must never ' +
        'import a route-private component — promote it to src/components/ instead.',
      severity: 'error',
      from: { path: '^src/(components|lib|vendor)/' },
      to: { path: '_components/' },
    },
    {
      name: 'no-cross-route-private-component',
      comment:
        'Route-private components belong to their own route tree. Importing another route\'s ' +
        '_components/ is the signal that the component is actually shared: move the folder to ' +
        'src/components/ (kebab-case) and import it from there. Granularity is the first ' +
        'segment under app/ — sibling routes inside one section may still share.',
      severity: 'error',
      from: { path: '^src/app/([^/]+)/' },
      to: { path: '^src/app/[^/]+/.*_components/', pathNot: '^src/app/$1/' },
    },
    {
      name: 'no-circular',
      comment:
        'A cycle means the two modules are really one. Split the shared part out rather than ' +
        'letting them import each other.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Without this, `import type` crossings are invisible — and several rules
    // above are about exactly those.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)\\.next/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
};
