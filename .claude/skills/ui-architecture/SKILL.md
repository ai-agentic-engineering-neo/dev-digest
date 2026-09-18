---
name: ui-architecture
description: "Frontend code organization and architecture for React + Next.js (App Router): where components/constants/utils/helpers/business logic should live, when to colocate vs. promote to shared, and how to split components and folders as a feature grows. Use whenever creating a new component, deciding where a file belongs, splitting a large component, or reviewing frontend folder structure. Does NOT cover React hooks-usage rules or performance (see react-best-practices) or Next.js rendering/API mechanics (see next-best-practices) — this skill is about WHERE code lives, not how it's written."
version: 1.0.0
---

# UI Architecture

Where frontend code lives and how it's organized — for React + Next.js (App Router).
This skill answers "where does this file go?" and "should I split this?". It does not
duplicate hooks-usage or Next.js API rules already covered elsewhere:

- Component internals, hooks rules, memoization, a11y → [react-best-practices](../react-best-practices/SKILL.md)
- Next.js routing/RSC/data-fetching mechanics → [next-best-practices](../next-best-practices/SKILL.md)

For concrete before/after folder layouts, see [examples.md](examples.md). For the full
source list this skill was built from, see [README.md](README.md).

## Core principle: colocate by default, promote when shared

> "Colocate everything until it hurts. Then abstract." — Kent C. Dodds

Start every new piece of code as close as possible to the one place that uses it. Only
move it to a shared location once a **second, unrelated consumer** actually needs it.
Promoting on the first guess ("this might be reusable") is premature abstraction —
promoting on the second real consumer is architecture.

```
1 consumer  → colocate next to that consumer
2+ consumers → promote to the nearest shared layer (feature-level, then app-level)
```

This single rule answers most "where does X go?" questions below.

## Decision checklist

When adding a new file, ask in order:

1. **Does only one route/feature use it?** → colocate inside that route/feature folder.
2. **Do 2+ features use it, but it's still feature-flavored?** → promote to that
   feature's own shared spot, or to the project's top-level shared folder if no
   feature owns it.
3. **Is it truly generic (no knowledge of any feature)?** → top-level `utils`/`lib`.
4. **Is it a fixed value that never changes at runtime?** → constant (see below).
5. **Does it decide something (a rule, a calculation, a policy)?** → business logic
   (see below), not a component.

## Components: placement and splitting

**Feature-scoped component** (used by one route/page only): colocate next to that
route. This project's convention — already aligned with community "colocation-first"
Next.js patterns — is:

```
app/some-route/
  page.tsx                          # thin: composes, doesn't implement
  _components/
    SomeFeature/
      SomeFeature.tsx
      styles.ts                     # colocated style objects
      helpers.ts                    # pure functions used only by this component
      constants.ts                  # values used only by this component
      SomeFeature.test.tsx
      index.ts                      # barrel: re-exports the public piece only
```

The leading underscore (`_components`) opts the folder out of Next.js routing — safe
to colocate anything there, it will never become a URL.

**Cross-cutting component** (used by 2+ routes/features, or is app chrome like a
header, shell, or generic button): promote to the project's top-level `components/`
(this repo: `client/src/components`). A component that only one place uses does not
belong there yet, even if it "feels" generic.

**When to split a component:** split along a responsibility boundary, not a line
count. A component should answer one question ("how do I render a PR diff?", not "how
do I render a PR diff AND handle its filters AND format its cost?"). If you're
reaching for a comment like `// --- filters section ---` inside one file, that section
is a separate component. (For the numeric guardrails — max lines, max props — see
react-best-practices; this skill only covers the organizational signal.)

**Container/presentational is not a required pattern.** Since hooks, the split between
a "container" that fetches and a "presentational" component that renders is usually
achieved by pulling data-fetching into a hook, not by wrapping components. Prefer:
component renders, hook fetches/derives. Don't add a wrapper component whose only job
is calling a hook and passing props down — call the hook where it's needed instead.

## Constants vs. utils vs. helpers

These three get confused constantly. Use this distinction:

| Kind | Definition | Lives where |
|---|---|---|
| **Constant** | A fixed value, known at write-time, that never depends on input (a config map, an enum-like union, a magic string/number given a name) | Colocated `constants.ts` if one feature uses it; top-level `lib/constants.ts` or `config/` if it's app-wide (e.g. API base URL, route paths) |
| **Util** | A pure, generic function with **no knowledge of any feature or domain** — it would make sense in a different project (`formatDate`, `slugify`, `groupBy`) | Colocated until a 2nd feature needs it, then top-level `utils/` (or `lib/` if the project already uses `lib` for this — check the existing top-level folder before creating a new one) |
| **Helper** | A pure function that shapes/derives data **for one specific feature or component** — it would NOT make sense anywhere else | Colocated `helpers.ts` next to the component/feature that uses it. Stays colocated even if it grows; it only promotes if a second feature independently needs the same shape of logic (at which point, question whether it's really a util or actually a shared domain concept) |

Order inside a file, per this project's convention: imports → constants → helpers →
component → exports.

## Where business logic lives

Split by what kind of decision is being made — this is the same split used across
"clean React architecture" write-ups (see README.md sources), simplified to three
layers:

1. **Presentation** — the component. Renders based on props/state. Makes no decisions
   beyond "what JSX given these inputs." No fetches, no business rules.
2. **Application/data logic** — a custom hook. Orchestrates fetching, combines
   multiple data sources, decides loading/error/empty states. In this repo, this is
   the `src/lib/hooks/*` layer — every data call goes through a hook there, never an
   ad-hoc `fetch` in a component.
3. **Domain/business rules** — plain, framework-free functions. Pricing rules,
   validation, scoring, anything you'd want to unit-test without rendering React at
   all. These belong in `lib/` (or a dedicated module near the domain they govern),
   called BY hooks or components — never inlined into a component body, and never
   silently duplicated into a hook when it's really a standalone rule.

Rule of thumb: if you could explain the logic to a backend engineer without mentioning
React, it's domain logic and belongs in a plain function, not a hook or a component.

## Next.js App Router: architecture, not performance

This section is about **where files live relative to routes** — not rendering
performance (that's next-best-practices).

- **Colocation is safe by default.** A file inside `app/some-route/` is never
  publicly served unless it's named `page.tsx` or `route.ts`. You do not need a
  private folder just to avoid accidentally exposing a route.
- **Use `_folder` (underscore prefix) anyway**, for consistency and IDE grouping —
  this project already does (`_components/`). It signals "implementation detail,
  not a route" to every future reader, and avoids future naming collisions with
  Next.js file conventions.
- **Route groups `(name)`** organize routes without affecting the URL — useful for
  giving a section of the app (e.g. an admin area) its own layout, or opting a
  subset of routes into a shared layout, without nesting the URL.
- **Pick one top-level strategy and stay consistent.** Next.js is explicitly
  unopinionated here; the three common strategies are: everything shared lives
  outside `app/` (this project's choice — `src/components`, `src/lib`); everything
  lives in top-level folders inside `app/`; or app-level code is split by
  route/feature. Don't mix strategies within one app — pick the first shared folder
  you reach for and be consistent about it project-wide.

## Shared code: one-directional dependencies

Shared code (`components/`, `hooks/`, `lib/`, `utils/`) may be imported by
feature/route code. Feature/route code may NOT be imported by shared code, and one
feature should not reach into another feature's folder directly.

```
shared (components, hooks, lib, utils)
   ↑
features / routes
   ↑
app (root layout, providers, router)
```

If two features need the same piece of feature-flavored logic, that's the signal to
promote it to shared (see the core principle above) — not to import feature A from
feature B. If two features need to be composed together, do that composition one
level up (at the page/route that uses both), not by cross-importing.

## Barrel files (`index.ts`): use narrowly, don't chain them

A small `index.ts` at a feature-component's own boundary — re-exporting just its
public piece, as this project's `_components/<Name>/index.ts` does — is fine: it
defines "here's the one thing this folder exposes," and the blast radius is one
folder.

What causes real problems (bundle bloat, slow builds, circular-import errors) is
**wide, app-level barrel chains** — a root `index.ts` that re-exports dozens of
unrelated modules, especially via `export *`. Avoid creating one of those. If you're
tempted to add a top-level barrel "for convenience," prefer direct imports from the
actual file instead.

## Quick reference

| Question | Answer |
|---|---|
| One route uses this component | Colocate in that route's `_components/` |
| 2+ routes use this component | Promote to top-level `components/` |
| Fixed value, one feature | Colocated `constants.ts` |
| Fixed value, app-wide | `lib/constants.ts` or `config/` |
| Generic pure function, no feature knowledge | Top-level `utils/` (once 2+ consumers) |
| Pure function shaping data for one feature only | Colocated `helpers.ts` |
| Fetches data / orchestrates loading state | Custom hook in `lib/hooks/` |
| Decides something without touching React at all | Plain function in `lib/` |
| Need the same logic in two features | Promote it — don't cross-import features |
