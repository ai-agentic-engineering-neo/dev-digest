# Next.js App Router structure

Contents: [What Next.js enforces](#what-nextjs-enforces) · [Where things go](#where-things-go) · [Private folders and groups](#private-folders-and-route-groups) · [Client/server split](#clientserver-split-as-an-architecture-question) · [Anti-patterns](#anti-patterns)

## What Next.js enforces (and what it doesn't)

- A route exists only when a segment has `page` or `route`. Everything else in `app/` is **safe to colocate**; it is not publicly routable. [N1]
- Next.js is explicitly **unopinionated** about the rest. It names three strategies: files outside `app`, top-level folders inside `app`, or split by feature/route. Picking one is a team decision. [N1]
- `_folder` (private folder) opts a folder and its children out of routing. It is **optional** — it separates UI code from routing code and avoids clashes with special file names. It is a convention, not a framework requirement. [N1]
- `(group)` folders organize routes without changing the URL; `src/` is optional and just separates source from config. [N1]

Because the framework doesn't decide, **consistency inside the repo is the rule**. Choose once, write it down, follow it.

## Where things go

```
src/
├── app/                         routing + route-private code only
│   └── repos/[repoId]/pulls/
│       ├── page.tsx             thin: params → hooks → compose views
│       ├── constants.ts         route-level shared constants
│       ├── helpers.ts           route-level shared pure helpers
│       ├── styles.ts
│       └── _components/         UI used only by this route
│           └── PRRow/{PRRow.tsx, index.ts, ...}
├── components/                  UI shared by 2+ routes (diff-viewer, app-shell, ...)
├── lib/                         cross-cutting: api client, hooks/, providers, theme
└── vendor/                      shared contracts + UI kit (treat as external)
```

Decision rule (same as SKILL.md flow, route-flavoured):
- Used by **one component** → nested under that component's `_components/`.
- Used by **several components of one route** → `<route>/_components/`.
- Used by **several routes** → `src/components/<name>/`.
- Not UI → `src/lib/` (hooks, API, providers).

## Private folders and route groups

- Use `_components/` for route-private UI. Keep it flat unless a component owns children — then those children go in *that component's* `_components/`, so the tree shows ownership. [N1][R3]
- Do not nest more than about two levels of `_components` before asking whether the parent is doing too much. [R3]
- Use `(group)` only to share a layout or to organize; do not use it as a feature folder substitute.
- Dynamic segments (`[repoId]`) hold route-specific code; never import from a *sibling* dynamic route — promote to `src/components/` instead. [R2][N1]

## Client/server split as an architecture question

Keep this to *where* things go; runtime semantics live in `next-best-practices`.

- Components are Server Components by default; add `"use client"` at the **interactive boundary** and push it toward the leaves, passing server-rendered content as `children`. [N3]
- Context providers must be client components — put them in `src/lib/providers.tsx`-style modules and mount them as deep as practical. [N3]
- Mark modules that must never reach the browser (secrets, private clients) with `import "server-only"`; the build then fails if a client component imports them. [N3]
- Wrap third-party components that need client features in your own thin client component, in one place, rather than sprinkling `"use client"` across call sites. [N3][R5]
- If the app is mostly client-rendered (as DevDigest's is), a `page.tsx` may itself be `"use client"`. That is acceptable, but it makes "thin page" matter *more*: orchestration belongs in hooks and child components, not the page body.

## Anti-patterns

- A `components/` dump at the repo root holding route-specific UI → move it next to its route.
- Importing across sibling routes (`../other-route/_components/X`) → promote to `src/components/`.
- `page.tsx` with data fetching, derivation, and 100 lines of JSX → extract hooks + views.
- `"use client"` at the top of a large tree "just in case" → move it to the interactive leaf.
- Inventing a second structure (e.g. a new top-level `features/`) beside an established one without a migration plan.
