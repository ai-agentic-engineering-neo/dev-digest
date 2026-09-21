---
name: frontend-ui-architecture
description: "React + Next.js frontend architecture and code organization guide — where components, constants, utils/helpers, and business logic should live, how to split components, feature-based folder structure, colocation, and module boundaries. Use whenever deciding WHERE a new component, hook, constant, util, or business-logic function should go, when designing or reviewing a feature folder, or when a component/file is growing and needs to be split. This is about project structure and separation of concerns, not component internals, hooks correctness, or performance — for those use react-best-practices; for Next.js file conventions (routing, RSC, metadata) use next-best-practices."
version: "1.0.0"
---

# Frontend UI Architecture

Guidance for **where code lives**, not how it's written. Covers React + Next.js
project structure, component splitting, and the placement of constants,
utils/helpers, and business logic. See [examples.md](examples.md) for
before/after folder trees and code, and [references.md](references.md) for
every source this skill is built on.

## Relationship to sibling skills

- **react-best-practices** — component internals, hooks correctness, state/memoization anti-patterns. Read that for *how* a component or hook is written.
- **next-best-practices** — Next.js-specific file conventions (routing, RSC boundaries, metadata, async APIs). Read that for framework mechanics.
- **This skill** — *where* a file belongs and *when* to split it. If a question is "should this be a hook or a component," go to react-best-practices; if it's "which folder should this file live in," stay here.

---

## Core Principle: Colocation Over Categorization

Default to organizing by **feature/domain**, not by technical type. A folder
structure of `components/`, `hooks/`, `utils/`, `services/` at the project
root forces every change to touch multiple folders and tells a new developer
nothing about what the app does. A structure organized by feature (`auth/`,
`billing/`, `search/`) keeps everything that changes together in one place,
and the folder names describe the product, not the framework — this is
sometimes called "screaming architecture."

The underlying rule (Kent C. Dodds, paraphrasing Dan Abramov): **things that
change together should live together.** Before creating a new top-level
folder, ask "what changes together?" rather than "what type of file is
this?"

## Top-Level Structure

```
src/
├── app/            # routing shell, providers, root layout (Next.js: app/)
├── features/        # one folder per domain/feature — most of the code lives here
│   └── <feature>/
│       ├── components/   # components used only by this feature
│       ├── hooks/         # feature-specific hooks (state, data fetching)
│       ├── api/            # feature-specific API calls / query definitions
│       ├── utils/          # pure helpers used only by this feature
│       ├── constants/       # feature-specific constants (or a constants.ts file)
│       └── types.ts
├── components/       # SHARED, reusable, feature-agnostic UI only (Button, Card, Modal)
├── hooks/            # SHARED hooks used by 2+ features (useDebounce, useMediaQuery)
├── lib/              # third-party client setup (API client, query client, auth client)
├── utils/            # SHARED pure utility functions with no feature knowledge
├── constants/         # SHARED, app-wide constants (routes, config, breakpoints)
└── types/             # SHARED types used across features
```

**The boundary rule:** a feature may import from `components/`, `hooks/`,
`lib/`, `utils/`, `constants/` at the root — but the root-level shared
folders must never import from `features/`, and one feature should not
reach into another feature's internals. If two features need to share
something, promote it to the root-level shared folder; don't import
across features directly.

## Where Does a New File Go? (decision order)

1. **Used by exactly one component, in one place?** Colocate it in that
   component's file or folder. Don't create a shared file for a single
   consumer — that's a premature abstraction.
2. **Used only within one feature?** Put it in that feature's
   `components/`, `hooks/`, `utils/`, or `constants/` subfolder.
3. **Used by 2+ features, has no feature-specific knowledge?** Promote it
   to the root-level shared folder (`components/`, `hooks/`, `utils/`,
   `constants/`).
4. **A route's UI, layout, or data fetching, in Next.js App Router?**
   Colocate it inside the route segment using a private folder
   (`_components/`, prefixed with `_` so Next.js doesn't treat it as
   routable) rather than a distant global folder — see
   [references.md](references.md) for the official Next.js colocation docs.

Files migrate outward as they gain consumers — don't pre-emptively put
everything in a shared folder "in case it's reused later." A helper used by
one component belongs next to that component until a second consumer
appears.

## Component Splitting

- A component earns a split when it mixes more than one concern (data
  fetching + layout + a complex interaction), not just when it gets long.
  Line count is a symptom, not the rule.
- Prefer extracting a **child component** when a chunk of JSX has its own
  clear responsibility and could be named on its own (`SearchResults`,
  `FilterPanel`) — not when you're just trying to shorten a function.
  React's own guidance: component boundaries should map onto your data
  model, the same way you'd decide whether something deserves its own
  function.
- Prefer extracting a **hook** when what you're pulling out is behavior
  (state, an effect, a subscription, data fetching) rather than markup.
  If it doesn't return JSX, it's a hook or a plain function, not a
  component.
- The container/presentational split still matters conceptually even
  though hooks replaced the class-based version of the pattern: something
  should decide *what* data to show (a hook), and something should decide
  *how* to render it (a component that receives props and stays free of
  data-fetching concerns).

## Where Business Logic Lives

Two different things get called "business logic," and they belong in
different places:

- **Pure business logic** — validation, calculations, data
  transformation/formatting, deciding "what should happen" from given
  inputs. Write these as **plain functions** with no React dependency:
  they take arguments, return a result, and can be unit-tested without
  rendering anything. Place them in the feature's `utils/` (or a
  `services/`/`domain/` file if the feature is large enough to want the
  distinction).
- **Application/UI logic** — orchestrating state, calling the pure
  business logic, wiring up data fetching, reacting to user interaction.
  This belongs in a **custom hook**, because only a hook can hold React
  state or reach into context. A hook should call the pure functions
  from `utils/`, not reimplement the logic inline.

Rule of thumb: if the logic needs `useState`, `useEffect`, `useContext`, or
any other hook, it has to live in a hook. If it's a pure calculation or
transformation with no such dependency, pull it out into a plain function
— that instantly makes it testable and reusable outside of React (e.g.
also from a server action or a Node script).

Never write business logic directly inside a component body beyond
calling a hook and rendering the result — a component that both computes
and renders is doing two jobs.

## Constants vs. Utils vs. Helpers

These three words get used loosely; pick one convention and apply it
consistently rather than agonizing over the label:

- **Constants** — fixed values that don't depend on runtime input: enum-like
  string unions, config values, breakpoints, route paths, feature flags,
  magic numbers pulled out of code. A constant is data, not behavior.
- **Utils** — small, pure, general-purpose functions with **no side
  effects** and no dependency on a specific feature's domain (formatters,
  validators, array/object helpers). If it could be copy-pasted into an
  unrelated project and still make sense, it's a util.
- **Helpers** (when a project distinguishes them from utils at all) —
  functions that assist one specific feature or one specific component,
  not general-purpose. Since the distinction is arbitrary across teams,
  this skill's recommendation is: don't create a separate `helpers/`
  folder — colocate feature-specific helpers inside that feature's
  `utils/`, and only keep a root-level `utils/` for genuinely
  feature-agnostic functions.

If a "utility" has a side effect (writes to storage, calls an API, mutates
something outside its arguments), it isn't a utility — treat it as
application logic and put it in a hook or service instead.

## Anti-Patterns to Flag

- **Barrel files as a default habit** (`index.ts` that only re-exports
  everything in a folder) — they look tidy but hurt tree-shaking, slow
  down dev servers and `tsc`, and are a common source of circular
  imports. Reserve a barrel for a folder's genuine public API surface,
  not every directory.
- **Deep cross-feature imports** — `features/billing` reaching into
  `features/auth/hooks/useInternalThing`. If billing needs something from
  auth, that something belongs in the shared layer, or auth should expose
  it through a narrow, intentional export.
- **A `utils/` or `helpers/` folder that becomes a junk drawer** — dozens
  of unrelated functions in one file. Split by concern
  (`utils/currency.ts`, `utils/validation.ts`) once a single file no
  longer describes what's in it.
- **Premature global folders** — creating `components/`, `hooks/`, or
  `constants/` entries for something used exactly once "because that's
  where they go." Colocate first; promote to shared only on a second
  consumer.
- **Atomic Design's five-tier hierarchy (atoms/molecules/organisms/…) as
  the primary organizing scheme for product code** — it works for a
  standalone design system, but it does not map naturally to
  domain/business logic and tends to fragment a single feature across
  five unrelated folders. Prefer feature-based grouping; reach for atomic
  tiers only inside a dedicated design-system package if you have one.

## Applied in This Repo (dev-digest)

`client/` (`@devdigest/web`) already implements the principles above with
its own naming twist — apply the rules through these concrete conventions
here rather than the generic folder names shown earlier:

- **Route-local UI** → private folders, exactly as in the Next.js example
  above: `client/src/app/<route>/_components/<PascalCaseName>/` (e.g.
  [client/src/app/agents/\_components](../../../client/src/app/agents/_components)).
  This is this skill's "colocate with the route" rule already in force.
- **Shared/reusable components** → `client/src/components/<kebab-case-name>/`
  (e.g. [client/src/components/diff-viewer](../../../client/src/components/diff-viewer)).
  Note the naming flips from PascalCase (route-local) to kebab-case here —
  that's the repo's own signal for "this promoted from a feature into the
  shared layer," so don't rename a component's case without also moving it.
- **Application logic / data fetching hooks** → one file per *domain* in
  `client/src/lib/hooks/` (`agents.ts`, `reviews.ts`, `repo-intel.ts`, …),
  not one file per hook. This is a deliberate variant of this skill's
  "hooks hold state/orchestration" rule: domain-level hook files replace
  a `hooks/` folder full of single-hook files.
- **Pure utils + third-party client setup live together** in `client/src/lib/`
  (`format-cost.ts`, `github-urls.ts`, `severity.ts`, `model-label.ts`
  alongside `providers.tsx`, `theme.tsx`). dev-digest doesn't split a
  separate top-level `utils/` from `lib/` — both this skill's "shared pure
  utils" and "third-party client setup" categories are merged into `lib/`.
  The underlying rule still applies: keep files in `lib/` pure/config-only,
  and colocate anything feature-specific inside that feature's route
  `_components/` instead of adding it to `lib/`.
- Before adding a new shared file, check
  [client/AGENTS.md](../../../client/AGENTS.md) (`client/CLAUDE.md` points
  here) — it is the authoritative source for this package's naming and
  should win over this skill's generic folder names whenever they conflict.

## Quick Checklist (for reviews)

1. Does the folder structure describe the product's domains, or does it
   describe React/Next.js technical categories at the top level?
2. Is anything in a shared folder (`components/`, `utils/`, `hooks/`,
   `constants/`) actually used by only one feature? → demote/colocate it.
3. Does any pure calculation/validation/formatting live inside a
   component body or a `useEffect` instead of a plain function? → extract
   it.
4. Does a hook reimplement business logic inline instead of calling a
   pure function from `utils/`? → extract the pure part.
5. Is there a barrel file whose only job is re-exporting a folder,
   outside of a genuine public-API boundary? → consider removing it.
6. Does any feature import directly from another feature's internal
   folders instead of a shared layer? → flag the boundary violation.
