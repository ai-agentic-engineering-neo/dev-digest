---
name: frontend-ui-architecture
description: "UI architecture and code organization for React 19 + Next.js 15 App Router — where files go, when to split a component, where business logic lives, and how to keep the boundaries from rotting. Use this skill whenever you are creating a new component, hook, page or route; deciding where a file, constant, type or helper belongs; splitting a component that has grown; moving code between feature-local and shared; drawing the server/client boundary; placing data fetching or mutations; or reviewing a PR for structure and layering — even when the user only says 'where should this go', 'this component is getting big', 'clean this up', 'refactor this folder' or 'is this the right place for it'. It decides placement and layering; it does not cover React anti-patterns (see react-best-practices), Next.js file-convention mechanics (see next-best-practices), or performance tuning."
version: 1.0.0
metadata:
  tags: react, nextjs, app-router, architecture, code-organization, file-structure, layering, rsc
  authored: local
  researched: 2026-09-18
---

# Frontend UI Architecture

Placement and layering decisions for a React 19 + Next.js 15 App Router codebase:
which file a piece of code belongs in, which folder that file belongs in, and
which boundaries it may cross.

Companion files:
- `examples.md` — before/after pairs for every rule that has a shape worth seeing.
- `README.md` — all 59 sources this skill is built from, with dates and trust tiers.

## Scope, and what this deliberately leaves alone

This skill answers **where**. Other skills answer **what** and **how**:

| Question | Skill |
|---|---|
| Where does this code live? Which boundary may it cross? | **this one** |
| Is this hook/state/render pattern correct? | `react-best-practices` |
| How does this Next.js file convention or API behave? | `next-best-practices` |
| How do I test it? | `react-testing-library` |

Performance is out of scope on purpose — bundle size, images, fonts and caching
for speed are architecture-adjacent but they are a different trade-off space,
and mixing them in produces rules that optimize the wrong thing.

## Read this first: most of this is convention, and you should say so

react.dev has **no** guidance on file or folder structure at all — it covers
component decomposition and stops there. Next.js calls itself *"unopinionated"*
about organization and offers three equally-valid strategies without picking
one. So the structural half of this skill is community convention, and the
honest move when you apply it is to say which kind of rule you are invoking:

- **Framework rule** — react.dev or nextjs.org states it. Violating it breaks something.
- **Convention** — widely adopted (bulletproof-react, FSD, Airbnb), no vendor authority. Consistency matters more than which one you pick.
- **House rule** — this repo's own choice. Match the neighbours; do not import a different convention into a folder that already has one.

Presenting a convention as a framework rule is the most common way this kind of
guidance goes wrong, because it shuts down a decision that a team is entitled to
make differently.

## The one principle everything else falls out of

**Colocate until there is a second consumer.** Code lives as close to its single
use as possible; it moves outward only when something else genuinely needs it.

This is Kent C. Dodds' colocation principle and Robin Wieruch's "Rule of Two",
and it is the tiebreaker whenever two of the rules below seem to conflict.
Its value is not tidiness — it is that deleting a feature should delete its code,
and that you can read one folder and know what it does.

The failure mode it prevents is **speculative sharing**: a `utils/` or
`components/` folder that fills up with things exactly one caller uses, where
nobody can change anything because in principle anyone might depend on it.

The inverse failure exists too — the same helper copy-pasted into four features.
The trigger for promotion is a *real second consumer*, not an imagined one.

## Where a file goes

Work down this list and stop at the first match.

1. **Used by exactly one component** → colocate inside that component's folder.
2. **Used by one route/feature** → colocate in that route's private folder (`app/<route>/_components/`). The `_` prefix is Next.js's own mechanism for opting a folder out of routing, so this is a framework-sanctioned location, not a hack.
3. **Used by two or more features** → promote to the shared layer (`src/components/`, `src/lib/`, `src/hooks/`).
4. **Routing, layout, metadata, or composing a page out of the above** → `app/`.

`app/` stays thin. A `page.tsx` should read as orchestration — take params, call
a feature component, return UI — because everything in `app/` is pinned to a URL,
and code pinned to a URL cannot be reused or moved without changing the URL.
This is the FSD/bulletproof-react position layered on top of Next.js's
neutrality; Next.js permits heavier `app/` folders, it just does not help you
when they become unmovable.

**Direction of imports is one-way: `shared → features → app`.** A shared module
that imports from a feature has stopped being shared. Two features that import
each other have stopped being two features — extract what they share downward
into the shared layer, or compose them at the `app/` layer. This is the single
structural rule with the most consensus behind it, and the only one worth
enforcing mechanically (see *Enforcement*).

## When to split a component

**No source supports a line-count rule.** Not react.dev, not Airbnb, not any of
the practitioners surveyed. If you catch yourself reaching for "over 200 lines,
split it", you are inventing authority that does not exist. Long and boring
beats short and scattered; splitting for length alone spreads one idea across
five files and makes it harder to read, not easier.

Split on these signals instead:

- **Two responsibilities.** react.dev's criterion: a component should be concerned with one thing. Two nouns in the name (`UserTableWithFilters`) is the usual tell.
- **Mutually exclusive branches.** Pending / empty / loaded / error tangled into nested ternaries is the real driver of cognitive load. Extract a layout component and give each state an early return — TypeScript narrows cleanly after each one, and no state is nested inside another. Conditional *content* (show a badge if assigned) is additive and fine; conditional *structure* is what to split.
- **A real second caller.** Reuse justifies extraction. *Anticipated* reuse does not.
- **A client island inside a server tree.** See the next section — this is a boundary, and boundaries are split points.

Signals that are **not** reasons to split: prop count on its own (deep,
explicit prop passing is traceable and react.dev calls it "not unusual"), file
length, or a desire to shorten a prop chain.

Two rules here are framework-level and non-negotiable, because breaking them
breaks behaviour rather than taste:

- Component names are capitalized — that is how JSX distinguishes them from HTML tags.
- **Never define a component inside another component's body.** It gets a new identity every render, so React unmounts and remounts it and its state resets. Pass props instead.

### Composition before context

The order is **props → extract a component and pass `children` → context**.
When you find yourself threading data through layers that do not use it,
react.dev's reading is that you probably forgot to extract a component — the
`children` slot lets the middle layer stay ignorant of what it wraps.

Reach for context for genuinely cross-cutting concerns (theme, current account,
routing). Do not put fast-changing state (form inputs, hover, tooltips) in
context or a global store: every consumer re-renders, and you have converted a
local concern into a global one.

Compound components (`<Tabs><Tab/></Tabs>`) earn their indirection only when the
consumer needs to lay children out freely — `ButtonGroup`, `TabBar`,
`RadioGroup`. When layout is fixed, or the children are mapped from API data,
they add boilerplate and buy nothing.

**Container/presentational is retired.** Dan Abramov withdrew the
recommendation in 2019: hooks extract stateful logic without forcing an
arbitrary two-file split. Do not propose it, and when you meet it in existing
code, leave it alone unless you are already changing that file.

## The server/client boundary is an architectural seam

In App Router this is the most consequential structural decision in the
codebase, because it decides what ships to the browser.

- Server Components are the default. Reach for a Client Component only for state, event handlers, lifecycle, browser APIs, or a hook that needs one of those.
- **`"use client"` marks a boundary in the module graph**: everything the marked file imports and directly renders joins the client bundle. So put it on the smallest interactive leaf (`<SearchBox>`), never on a page or layout — marking a layout drags its whole subtree client-side.
- **A Server Component passed as `children` or a prop does not cross into the client bundle.** `<Modal><Cart /></Modal>` keeps `Cart` server-rendered even though it renders inside a client component, because the client component is its *parent*, not its *owner*. This is the pattern that lets you keep state in a tiny client wrapper and the content on the server — and it also sidesteps prop serialization, since you pass rendered JSX rather than data.
- Providers must be Client Components. Render them as deep as possible, wrapping `{children}`, not `<html>`.
- Static properties break across the boundary — a Server Component importing a Client Component gets a client reference, so `Menu.Item` comes back `undefined`. Use named exports for anything that crosses.
- `import 'server-only'` turns a wrong import into a build error instead of a leaked secret. Put it at the top of every module that touches secrets or the database.

## Where business logic goes

Four homes, in order of preference:

1. **A plain function in a module.** The default. If it does not call a hook, it is not a hook — do not prefix it `use`. Plain functions are callable conditionally, testable without a renderer, and usable from server code, event handlers and route handlers alike.
2. **A custom hook**, when the logic genuinely needs React state, context or effects. Name it for a concrete use case (`useChatRoom`, `useMediaQuery`), not a mechanism (`useMount`, `useUpdateEffect` — lifecycle wrappers hide missing dependencies and fight the model). Write the effect inline in the component first; extract only once the use case has a name.
3. **A server-only data module (DAL)**, for anything touching the database or secrets. See below.
4. **The component body** — only rendering and the wiring between the above.

Effects are for synchronizing with an external system. If nothing external is
involved you probably do not need one: derive during render, handle interactions
in handlers, reset state on a prop change with `key`, and share logic between
handlers with a plain function rather than an effect that watches state. The
test that settles most cases: *does this need to run because the component was
displayed, or because of a specific interaction?*

### The Data Access Layer

For anything that reads or writes real data, Next.js's own security guidance is
unusually prescriptive and worth following exactly, because the alternative
failure is an authorization bug rather than a mess:

- A DAL module starts with `import 'server-only'`.
- It performs the authorization check itself, close to the data.
- It returns DTOs shaped for the UI, not raw rows.
- **Only the DAL reads `process.env`** for secrets.
- Wrap session verification in React `cache()` so one request checks once.

Two traps that look safe and are not:

- **A page-level auth check does not protect a Server Action defined in that file.** Every action is independently reachable by POST; it must verify caller and per-resource ownership on its own. Keep the `"use server"` function thin and delegate to the DAL.
- **Auth checks do not belong in layouts.** Layouts do not re-render on client-side navigation, so the check will not re-run — and hiding a slot does not stop that slot's data fetch. (Same trap in parallel routes: every slot renders on the server regardless of which one the layout returns. The conditional decides what the user *sees*, not what *runs*.)

### Where data fetching goes

| Need | Put it |
|---|---|
| Data for a page | Server Component, fetched directly from the source |
| A mutation | Server Action (thin) → DAL |
| Client-only Web API (geolocation, storage, File) | Client Component + a query hook |
| Frequent polling, infinite scroll, offline | TanStack Query |
| A public, non-UI endpoint (webhook, callback, third-party consumer) | Route Handler |

Do not call your own Route Handler from a Server Component — it adds a real HTTP
round trip and breaks static prerendering, since nothing is listening at build
time. Fetch from the source. And do not use Server Actions for reading: they are
dispatched sequentially per client, so a fetch through one serializes your page.

**Never source the same data twice.** Reading a query in a Server Component
*and* re-querying it with `useQuery` on the client is the documented
anti-pattern — React Query cannot revalidate a Server Component, so the two
drift apart with no mechanism to reconcile them. Prefetch into a
`<HydrationBoundary>` and consume with `useSuspenseQuery`, or pick one side.

TanStack Query's own maintainers say to start with framework-native fetching and
add Query when you actually need it. When you do: colocate query keys and query
functions with the feature that owns them, export hooks rather than raw keys,
and prefer `queryOptions()` factories over custom hooks when all you are sharing
is configuration — a plain object works in loaders and event handlers, where a
hook cannot.

## Constants, helpers, types, naming

- **Constants** colocate with their only consumer, then promote to a shared `config` module once a second one appears. No source endorses a global `constants/` dump. Environment variables and app config are a separate thing from magic values and belong in `config`, read in one place.
- **`lib/` vs `utils/`**: the only distinction with real backing across sources is `lib` = preconfigured third-party wrappers (an axios instance, a query client) and `utils` = your own pure functions. **`utils` vs `helpers` has no authority behind anyone's definition** — pick one word per codebase and delete the other rather than inventing a boundary nobody can apply consistently.
- **Types** follow their data. Derive from the schema where one exists (`z.infer`) so the schema stays the single source of truth; note that `.transform()` splits `z.input` from `z.output`. Colocate a type with its module until a second module needs it.
- **Tests** sit next to their subject. Cross-module integration and e2e tests get their own tree, because they do not belong to any one module.
- **Barrel files**: the criticism is real but narrower than it sounds. A barrel that re-exports a *curated public surface* is a useful contract — the export list becomes a visible diff when the API changes. What actually costs you is `export *`, and app-root mega-barrels that force every importer to evaluate every module behind them. So: one narrow index per component or slice, never `export *`, and never import a third-party library through a barrel.

## Enforcement — pick the cheapest tier that fits

Conventions that live only in documentation decay. These are ordered by cost;
take the first one that expresses the boundary you actually need, and do not
stack them.

| Tier | Tool | Use when |
|---|---|---|
| 1 | `import/no-restricted-paths` (eslint-plugin-import) | One-directional bans: "features may not import from app", "no cross-feature imports". What bulletproof-react itself recommends. Note `from` matches the **resolved** path, which matters with path aliases. |
| 2 | `eslint-plugin-boundaries` | You need rules by element *type* (component vs feature vs lib), to restrict which npm packages a layer may use, or to force imports through a public entry point. |
| 3 | `dependency-cruiser` | Whole-graph or cross-package checks ESLint cannot see, staged rollout via severity levels, or a dependency graph you want to look at. Runs as its own CI gate. |
| 4 | TypeScript project references | You want the **compiler** to refuse the import, not a linter. Real isolation, real setup cost — fits genuine package splits, not folders inside one app. |
| — | `Steiger` | Only if the codebase commits to full Feature-Sliced Design. Still beta; do not make it a blocking gate. |

Two smaller ones worth having regardless: `no-magic-numbers` (numbers only — no
core ESLint rule exists for magic strings, so any rule there is house
convention) and `consistent-type-imports` (keeps type-only imports erasable,
which matters wherever a barrel re-exports types beside runtime code).

## Where the ecosystem genuinely disagrees

Do not paper over these. When one comes up, say that it is contested, give the
trade-off, and follow what the codebase already does.

- **Feature folders vs type folders** (`features/*` vs `components/ hooks/ utils/`). bulletproof-react, FSD and Wieruch favour feature-first past a small size; Josh Comeau argues type-first at any size, because feature boundaries are vague and drift. No consensus exists. Consistency beats the choice.
- **How strict the layering should be.** bulletproof-react's two tiers vs FSD's six ordered layers. FSD's extra vocabulary (entity vs feature vs widget) is a real cost, not a free upgrade — it pays off only in a domain rich enough to need it.
- **Barrel files.** Covered above; the middle ground satisfies every source.
- **One component per file.** Airbnb codifies it; Comeau calls the blanket rule silly; react.dev only forbids *nested* definitions. Treat nesting as the hard rule and one-per-file as a soft default once a component stops being trivial.
- **Clean/hexagonal architecture on the frontend.** Ports, use-cases and adapters are defensible for a genuinely complex domain, and overkill otherwise — its own leading advocate says so. The minimum viable version is: extract the pure domain logic, enforce the dependency direction, stop there.

## Review checklist

When reviewing structure — a PR, or your own work before proposing it:

- Does `app/` contain anything that would still make sense at a different URL?
- Does any shared module import from a feature? Does any feature import another?
- Is `"use client"` on a leaf, or has it been parked on a page or layout?
- Does a Server Action or Route Handler re-check authorization, rather than trusting the page that renders it?
- Is any value both read on the server and re-queried on the client?
- Is there state in a store or context that only one subtree uses?
- Was anything put in `shared/` with exactly one caller?
- Is there a derived value sitting in `useState` + `useEffect` instead of being computed during render?
- Does every new file match the conventions of the folder it landed in?

## In DevDigest specifically

`client/` already has a house convention; this skill layers on top of it and
does not replace it. Read `client/docs/component-conventions.md` before
creating or moving a component. The parts that are house rules here:

- **Every component is a folder**, never a bare `.tsx`: `<Name>.tsx`, `index.ts`, plus `styles.ts` / `constants.ts` / `helpers.ts` / `<Name>.test.tsx` as needed.
- **Folder case depends on location** — kebab-case under `src/components/`, PascalCase under `app/**/_components/`. Both are intentional; match the neighbours rather than normalizing.
- **`_` means private to its parent** — `app/**/_components/`, `db/schema/_shared.ts`, `modules/_shared/`. Never import one from outside.
- **`fetch` in a component is banned**; go through a hook in `src/lib/hooks/` → `lib/api.ts`. A new endpoint means a new hook, not an inline call.
- **User-facing text goes through `next-intl`**, never hardcoded.
- **Everything under `src/vendor/` is vendored** — read it, do not edit it, and do not write a generic input or chart that already exists in `@devdigest/ui`.
- `@devdigest/shared` exists in two physical copies that have drifted; changing a contract means changing both in the same commit.

The repo is not a pnpm workspace — the four packages are linked only by tsconfig
path aliases, so tier-4 enforcement (project references) is the one that matches
those boundaries, while anything inside `client/` wants tier 1 or 2.

## Version history

- **1.0.0** (2026-09-18) — First version. Built from a 59-source research pass; see `README.md` for the full list, dates and trust tiers. Next.js guidance verified against v16.3.5 docs and restricted to APIs stable since 13–14, since this repo pins Next.js 15.
