/**
 * Import rules for client/src.
 *
 * Rules and rationale: ../.claude/skills/frontend-architecture/SKILL.md
 * ("Imports"). Run from client/:  pnpm deps:validate
 *
 * Path aliases (@/*, @devdigest/ui, @devdigest/shared) resolve through
 * tsconfig.json, so every rule sees the real file behind an alias.
 */

// Component folders are matched by name only ($1, $2): route folders such as
// [repoId] are not safe inside a regex, and dependency-cruiser rejects nested
// quantifiers. A route component lives in src/app/**/_components/<Pascal>/, a
// shared one in src/components/<kebab>/. A folder's own files, and the files of
// components nested in it, may use its constants, helpers and styles; nothing
// else may (use index.ts).
//   FOLDER_FILE  any file in a top-level route component, nested folders excluded
//   NESTED_FILE  a file in a component nested one level down ($1 outer, $2 inner)
//   LOOSE_NESTED a file directly in <Outer>/_components/ ($1 outer)
//   outside      a file in no component folder: pages, route helpers, src/lib
const FOLDER_FILE =
  '^src/(?:(?!_components/).)+/_components/([A-Z][A-Za-z0-9]*)/(?:(?!_components/).)+$';
const NESTED_FILE =
  '^src/.+?/_components/([A-Z][A-Za-z0-9]*)/_components/([A-Z][A-Za-z0-9]*)/[^/]+$';
const LOOSE_NESTED = '^src/.+?/_components/([A-Z][A-Za-z0-9]*)/_components/[^/]+$';
const IN_COMPONENT_FOLDER = ['/_components/[A-Z]', '^src/components/[^/]+/'];
const COMPONENT_INTERNALS = [
  '/_components/[A-Z][A-Za-z0-9]*/(constants|helpers|styles)\\.ts$',
  '^src/components/[^/]+/(constants|helpers|styles)\\.ts$',
];
const SHARED_FILE = '^src/components/([^/]+)/';

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
        'down a row, into the route folder or src/lib. Type-only imports count. ' +
        'This variant covers route components; the three below cover nested ' +
        'components, shared src/components folders and files in no component.',
      severity: 'error',
      from: { path: FOLDER_FILE },
      to: { path: COMPONENT_INTERNALS, pathNot: ['/_components/$1/[^/]+$'] },
    },
    {
      name: 'nested-component-folder-entered-through-index',
      comment:
        'A nested component may use its own and its parent\'s constants, ' +
        'helpers and styles, never a sibling\'s. A loose file in the parent\'s ' +
        '_components/ is held to the parent\'s folder.',
      severity: 'error',
      from: { path: NESTED_FILE },
      to: {
        path: COMPONENT_INTERNALS,
        pathNot: ['/_components/$1/[^/]+$', '/_components/$1/_components/$2/[^/]+$'],
      },
    },
    {
      name: 'nested-loose-file-enters-component-through-index',
      comment: 'See nested-component-folder-entered-through-index.',
      severity: 'error',
      from: { path: LOOSE_NESTED },
      to: { path: COMPONENT_INTERNALS, pathNot: ['/_components/$1/[^/]+$'] },
    },
    {
      name: 'shared-component-folder-entered-through-index',
      comment:
        'A src/components/<name>/ folder keeps its constants, helpers and ' +
        'styles to itself; other code uses its index.ts or moves the value to ' +
        'src/lib.',
      severity: 'error',
      from: { path: SHARED_FILE },
      to: { path: COMPONENT_INTERNALS, pathNot: ['^src/components/$1/'] },
    },
    {
      name: 'non-component-file-enters-component-through-index',
      comment:
        'A page, a route-level helpers.ts or a src/lib file is outside every ' +
        'component folder, so it may use a component only through its index.ts.',
      severity: 'error',
      from: { path: '^src/', pathNot: IN_COMPONENT_FOLDER },
      to: { path: COMPONENT_INTERNALS },
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
