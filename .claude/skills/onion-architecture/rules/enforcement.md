# Making the dependency rule structural, not just reviewed

Everything in this skill so far is enforced by convention and code review — real, but a human can miss it, especially as the codebase grows. If layering violations keep slipping through, the next step is a lint rule that fails CI on an inward import of an outer-layer concrete type. This is **optional** — propose it if you notice repeated violations of the same shape, don't add it preemptively without that signal.

## Two tools that do this for TypeScript/Node

**[eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries)** — classifies files into architectural "elements" (e.g. `routes`, `service`, `repository`, `adapter`) by glob pattern, then lets you declare which element types may import which. For this repo's vertical-slice-by-filename structure, the element patterns would key off filename rather than folder:

```js
// illustrative — not yet wired into this repo
settings: {
  'boundaries/elements': [
    { type: 'routes', pattern: 'server/src/modules/*/routes.ts' },
    { type: 'service', pattern: 'server/src/modules/*/service.ts' },
    { type: 'repository', pattern: 'server/src/modules/*/repository.ts' },
    { type: 'adapter', pattern: 'server/src/adapters/**' },
    { type: 'ports', pattern: 'server/src/vendor/shared/adapters.ts' },
  ],
},
rules: {
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'routes', allow: ['service', 'ports'] },
      { from: 'service', allow: ['repository', 'ports', 'adapter'] }, // via container only, in spirit
      { from: 'repository', allow: ['ports'] },
      { from: 'adapter', allow: ['ports'] },
    ],
  }],
},
```

Note the honest limitation: `eslint-plugin-boundaries` checks *file-to-file* import edges, not "does `service.ts` call the port interface vs. the concrete class" — that distinction (application code depending on the *type* `LLMProvider` vs. the *class* `OpenRouterProvider`) is closer to what `container.ts` centralizing all adapter imports already gives you for free. The lint rule's real value here is catching the blunter violations: `routes.ts` importing `db/schema`, `service.ts` importing an `adapters/*` file directly instead of going through `container`.

**[dependency-cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)** — a complementary, more general dependency-graph analyzer: detects circular dependencies, can enforce the same "may not import" rules via a `.dependency-cruiser.js` config, and can render the actual dependency graph as an image — useful for a one-off audit ("show me every place `db/schema` gets imported from") even without wiring it permanently into CI.

Broader comparison of options if neither tool above fits: [6 Tools for Enforcing Good Web Architecture — jmulholland.com](https://jmulholland.com/architecture-tools/).

## Suggested rollout if the team decides to adopt this

1. Run `dependency-cruiser` once, ad hoc, to see how many existing violations there already are before committing to a hard CI gate — a rule that fails on day one against dozens of pre-existing violations gets disabled, not fixed.
2. Start with `eslint-plugin-boundaries` in `warn` mode in `server`'s `pnpm lint`, scoped to the two blunt rules above (routes → db, service → adapters bypassing container).
3. Promote to `error` once the existing codebase is clean, and add it to the CI lint step alongside the existing `pnpm lint`/`pnpm typecheck` gates.

This is infrastructure for the *team's* workflow (CI config, `package.json` devDependencies, lint config) — treat adding it as a deliberate, reviewed change, not something to slip into an unrelated feature PR.
