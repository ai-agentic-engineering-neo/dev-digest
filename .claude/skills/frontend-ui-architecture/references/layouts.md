# Reference layouts and enforcement

Three sizes of the same idea. Pick the smallest one that fits today; the move to
the next is mechanical when the principles in `SKILL.md` were followed.

## Contents

1. Small: component folders + technical folders
2. Medium: feature folders (bulletproof-react style)
3. Large: Feature-Sliced Design
4. Choosing and migrating
5. Enforcing the dependency direction

## 1. Small — one team, a handful of screens

```
src/
  app/                  # routes (Next.js) or App.tsx
  components/
    PullList/
      PullList.tsx
      PullList.test.tsx
      helpers.ts
  hooks/
  lib/                  # api client
  utils/
```

Every component still gets its own folder once it has a second file. There are
no feature folders yet because there is nothing to separate.

**Outgrown when** `components/` mixes generic UI (Button, Modal) with screens,
and nobody can tell which is which.

## 2. Medium — feature folders

The shape Bulletproof React and Robin Wieruch converge on:

```
src/
  app/                  # routes, providers, composition
  features/
    reviews/
      api/              # fetchers + schemas + hooks for this resource
      components/
      hooks/
      stores/           # only if the feature has client-only shared state
      types.ts
      helpers.ts
      constants.ts
  components/           # generic UI only
  hooks/                # generic hooks only
  lib/                  # configured libraries
  config/               # env + global config
  stores/               # app-wide client state (rare)
  testing/              # test utilities, mocks
  types/                # truly shared types
  utils/                # generic pure functions
```

Rules that make it work:

- Only the folders a feature needs exist in it.
- Flow is `shared → features → app`; features never import features.
- A util used by exactly one feature lives in that feature; once two or more
  need it, it moves to shared.

**Outgrown when** features start needing each other's *entities* (a "user" or
"pull request" model used by six features), and cross-feature imports creep in.

## 3. Large — Feature-Sliced Design

FSD adds explicit layers, top to bottom: `app → pages → widgets → features →
entities → shared`. A module may import only from layers **below** it. Within a
layer, code is split into *slices* (by domain) and *segments* (`ui`, `api`,
`model`, `lib`, `config`).

With Next.js:

- Rename the FSD `app` and `pages` layers to `_app` and `_pages` (or `views`) to
  avoid clashing with Next.js routing folders.
- Keep Next.js routes in the root `app/`; each `page.tsx` re-exports a page from
  the FSD layer.
- Split a slice's server-only exports into `index.server.ts` so client imports of
  the slice do not pull server code.
- Each slice's `index.ts` is its public API: named exports, no `export *`.
  Same-layer imports between entities go through the explicit `@x` notation and
  are kept to a minimum.

FSD is the right tool for many teams on one frontend; for most projects it is
heavier than needed. Adopt it deliberately, with its linter (`steiger`), not
piecemeal.

## 4. Choosing and migrating

| Signal | Layout |
|---|---|
| < ~10 screens, one team | small |
| distinct business capabilities, features rarely share models | medium |
| many teams, many shared entities, cross-feature imports keep appearing | FSD |

Migrate by moves that each compile and ship on their own:

1. Create the target folder for one feature; move its files; fix imports.
2. Repeat per feature. Never keep old and new paths alive via re-export shims.
3. Turn on lint enforcement only after the moves, as a warning first.

## 5. Enforcing the dependency direction

Review catches direction violations in a small codebase; a linter is needed past
that. Two options:

**`import/no-restricted-paths`** (eslint-plugin-import) — the Bulletproof React
approach:

```js
"import/no-restricted-paths": ["error", {
  zones: [
    // features cannot import other features
    { target: "./src/features/reviews", from: "./src/features", except: ["./reviews"] },
    // shared cannot import features or app
    { target: ["./src/components", "./src/hooks", "./src/lib", "./src/utils"],
      from: ["./src/features", "./src/app"] },
  ],
}],
```

**`eslint-plugin-boundaries`** — declares element types and allowed
dependencies, default-deny:

```js
settings: {
  "boundaries/elements": [
    { type: "app",     pattern: "src/app/*" },
    { type: "feature", pattern: "src/features/*", capture: ["name"] },
    { type: "shared",  pattern: "src/(components|hooks|lib|utils|config|types)/*" },
  ],
},
rules: {
  "boundaries/dependencies": [2, {
    default: "disallow",
    policies: [
      { from: { element: { type: "app" } },     allow: { to: { element: { type: ["feature", "shared"] } } } },
      { from: { element: { type: "feature" } }, allow: { to: { element: { type: "shared" } } } },
      { from: { element: { type: "shared" } },  allow: { to: { element: { type: "shared" } } } },
    ],
  }],
},
```

Check the plugin's current docs before copying — rule names have changed between
major versions.
