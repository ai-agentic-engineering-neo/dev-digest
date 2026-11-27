/**
 * Import rules for client/src.
 *
 * Rules and rationale: ../.claude/skills/frontend-architecture/SKILL.md
 * ("Imports"). Run from client/:  pnpm deps:validate
 *
 * Path aliases (@/*, @devdigest/ui, @devdigest/shared) resolve through
 * tsconfig.json, so every rule sees the real file behind an alias.
 */

// The component folder a file sits in, captured by name only as $1 (route
// folders such as [repoId] are not safe inside a regex). FOLDER_FILE is a file
// directly in a top-level component folder; NESTED_FILE is one directly in a
// component folder nested inside it ($1 = outer, $2 = inner). A nested folder
// may use its parent's constants, helpers and styles, but not a sibling's.
const FOLDER_FILE = '^src/(?:(?!_components/).)+/_components/([A-Z][A-Za-z0-9]*)/[^/]+$';
const NESTED_FILE =
  '^src/.+?/_components/([A-Z][A-Za-z0-9]*)/_components/([A-Z][A-Za-z0-9]*)/[^/]+$';
const COMPONENT_INTERNALS = '/_components/[A-Z][A-Za-z0-9]*/(constants|helpers|styles)\\.ts$';

const FRAMEWORK_PACKAGES =
  'node_modules/(@types/)?(react|react-dom|next|@tanstack/[^/]+|next-intl)/';

module.exports = {
  forbidden: [
    {
      name: 'lib-and-components-never-import-app',
      comment:
        'src/lib and src/components are shared code; a route is a consumer of ' +
        'them, never the other way round. Move what both need into src/lib or ' +
        'src/components.',
      severity: 'error',
      from: { path: '^src/(lib|components)/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'lib-never-imports-components',
      comment:
        'src/lib is below src/components. A hook or helper that needs a ' +
        'component is in the wrong place.',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/components/' },
    },
    {
      name: 'route-never-imports-unrelated-route',
      comment:
        'app/agents and app/repos do not reach into each other. Code two ' +
        'top-level routes share belongs in src/lib or src/components.',
      severity: 'error',
      from: { path: '^src/app/([^/]+)/' },
      to: { path: '^src/app/[^/]+/', pathNot: ['^src/app/$1/'] },
    },
    {
      name: 'component-folder-entered-through-index',
      comment:
        'Another component folder is used through its index.ts. Needing its ' +
        'constants, helpers or styles means they have two consumers: move them ' +
        'down a row, into the route folder or src/lib. Type-only imports count.',
      severity: 'error',
      from: { path: FOLDER_FILE },
      to: { path: COMPONENT_INTERNALS, pathNot: ['/_components/$1/[^/]+$'] },
    },
    {
      name: 'nested-component-folder-entered-through-index',
      comment:
        'Same rule one level down: a nested component may use its own and its ' +
        'parent\'s constants, helpers and styles, never a sibling\'s.',
      severity: 'error',
      from: { path: NESTED_FILE },
      to: {
        path: COMPONENT_INTERNALS,
        pathNot: ['/_components/$1/[^/]+$', '/_components/$1/_components/$2/[^/]+$'],
      },
    },
    {
      name: 'helpers-and-constants-stay-pure',
      comment:
        'helpers.ts and constants.ts hold rules and values only: no React, ' +
        'Next, TanStack Query or next-intl. Logic that needs them goes in a ' +
        'use<Thing>.ts or the .tsx.',
      severity: 'error',
      from: { path: '(^|/)(helpers|constants)\\.ts$' },
      to: { path: FRAMEWORK_PACKAGES },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // Type-only imports count, as they do in the greps this replaces.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
