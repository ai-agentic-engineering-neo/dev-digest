# Frontend UI Architecture Skill

**Version:** 1.0.0
**Compiled:** 2026-09-21

## What this skill is

A project-authored skill that governs **where React/Next.js code lives** in
dev-digest's `client/` package (`@devdigest/web`) — feature-based folder
structure and colocation, when a component earns a split, whether a piece of
logic belongs in a plain function or a hook, and the constants/utils/helpers
naming convention. It is the client-side counterpart to
`onion-architecture` (which governs backend dependency direction for
`server/` and `reviewer-core/`): both skills share the same underlying idea —
keep things that change together in one place, and keep boundaries
intentional — applied to different runtimes.

Explicitly **not** about component internals, hooks correctness, or
performance (`react-best-practices`), and not about Next.js routing/RSC/
metadata mechanics (`next-best-practices`) — this skill only touches those
areas insofar as they affect *where* a file lives.

## When this skill fires

- Deciding where a new component, hook, constant, util, or business-logic
  function should go.
- Designing or reviewing a feature folder.
- A component or file is growing and needs to be split.
- Reviewing a PR for folder-structure or module-boundary violations (a
  feature reaching into another feature's internals, a barrel file, a
  premature shared folder).
- Deciding whether route-local UI in the Next.js App Router belongs in a
  private `_components/` folder or the shared `components/` folder.

## Files in this skill

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Entry point: core colocation principle, sibling-skill relationships, and quick routing to the other three files. |
| [folder-structure.md](folder-structure.md) | Top-level project layout, the decision order for where a new file goes, folder-level anti-patterns (barrels, cross-feature imports, premature global folders), and dev-digest's own shared-component conventions. |
| [component-organization.md](component-organization.md) | Component-splitting heuristics, where business logic lives (pure function vs. hook), the constants/utils/helpers convention, and dev-digest's `client/src/lib/` conventions. |
| [nextjs-organization.md](nextjs-organization.md) | Route-local UI via private folders in the App Router, and dev-digest's `_components/` naming convention. |
| README.md (this file) | Skill overview, version, and every source the skill is built on. |

## Relationship to sibling skills

- **react-best-practices** already covers component internals, hooks
  correctness, and state/memoization anti-patterns in depth — this skill
  does not repeat those and instead cross-references it for anything about
  component *internals*.
- **next-best-practices** already covers Next.js file conventions (special
  files, route segments, parallel/intercepting routes, RSC boundaries,
  async APIs) in detail — this skill only touches Next.js insofar as route
  colocation affects *where* application code lives, and defers to
  `next-best-practices` for framework mechanics.
- **onion-architecture** is the backend counterpart — read that one for
  anything about where server-side code lives and which direction backend
  dependencies point.

## References

Grouped by the question each source answers in this skill.

### 1. Project structure / feature-based architecture — [folder-structure.md](folder-structure.md)

- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) —
  the reference implementation this skill's top-level layout is modeled on:
  `app/`, `components/` (reusable only), `features/<name>/{api,components,hooks,stores,types,utils}`,
  `hooks/`, `lib/`, `stores/`, `types/`, `utils/`, with the explicit rule that
  features must not import each other directly.
- [Bulletproof React (GitHub repo)](https://github.com/alan2207/bulletproof-react) —
  the full example application implementing the guide above.
- [Feature-Sliced Design](https://feature-sliced.design/) and
  [FSD docs](https://feature-sliced.design/docs) — a more formal methodology
  with layers (app/pages/widgets/features/entities/shared) and a strict
  unidirectional-dependency rule (a layer may depend only on layers below
  it). Useful as a stricter alternative once a plain feature-folder
  structure stops being enough.
- [Robin Wieruch — React Folder Structure (2026)](https://www.robinwieruch.de/react-folder-structure/) —
  a practical, incrementally-scaling guide from a small app to a large one,
  including the `constants/` vs `utils/` discussion referenced below.
- [Screaming Architecture & Colocation](https://thetshaped.dev/p/screaming-architecture-and-colocation-nodejs-typescript-react) —
  the idea that a project's folder structure should describe the product
  domain, not the framework or technical layers.
- [Screaming Architecture in Front-End (Medium)](https://medium.com/@hrynkevych/screaming-architecture-in-front-end-de72d9ec961c) —
  applies Robert C. Martin's "screaming architecture" concept specifically
  to front-end codebases.
- [Enforce Architectural Policies in JavaScript with ESLint (DEV.to)](https://dev.to/ptvty/enforce-architectural-policies-in-javascript-with-eslint-mhe) —
  using `eslint-plugin-boundaries` to turn "features shouldn't import each
  other directly" from a convention into a lint rule, the practical way to
  enforce [folder-structure.md](folder-structure.md)'s boundary rule at
  scale.
- [Feature-Sliced Design — Frontend Monorepo Explained](https://feature-sliced.design/blog/frontend-monorepo-explained) —
  cohesion/coupling principles for larger front-end codebases, relevant if
  a `features/` directory eventually needs to split into separate packages.

### 2. Colocation (what lives next to what) — [folder-structure.md](folder-structure.md), [nextjs-organization.md](nextjs-organization.md)

- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) —
  the foundational principle the "colocate first, promote later" rule is
  built on: "place code as close to where it's relevant as possible";
  "things that change together should be located as close as reasonable"
  (attributed to Dan Abramov).
- [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) —
  colocation applied specifically to where state lives (tangential to
  performance, but the organizational principle is the relevant part here).
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) —
  an interactive walkthrough of colocating a component with its styles,
  tests, and hooks.
- [Next.js docs — Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) —
  official confirmation that files inside `app/` can be safely colocated: a
  route only becomes public once a `page.tsx`/`route.ts` exists in that
  segment.
- [Next.js docs — Routing: Project Organization (colocation)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) —
  the same guidance, including private folders (`_folder`) for separating
  UI/implementation detail from routing — the direct source for
  [nextjs-organization.md](nextjs-organization.md).

### 3. Component splitting (single responsibility, where the boundary is) — [component-organization.md](component-organization.md)

- [React docs — Thinking in React](https://react.dev/learn/thinking-in-react) —
  the official method: a component should ideally do one thing; if it
  grows, decompose it; component boundaries should map onto the
  application's data model, the same way you'd decide whether something
  deserves its own function.
- [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) —
  widely-adopted file-level conventions (one component per file, ordering,
  naming) referenced for the "one component, one file" guidance.
- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) —
  the classic split between "what data to show" and "how to show it"; still
  conceptually useful even though hooks now usually play the container's
  role instead of a wrapper component.
- [Is Atomic Design Still Relevant in 2025?](https://www.designsystemscollective.com/is-atomic-design-still-relevant-in-2025-d9c214788cfe) —
  the critique behind the recommendation to avoid Atomic Design's five-tier
  hierarchy as the primary organizing scheme for product/business code: it
  doesn't map well onto domain logic and fragments a feature across
  unrelated folders. Better suited to an isolated design-system package.

### 4. Where business logic lives (hooks vs. pure functions/services) — [component-organization.md](component-organization.md)

- [Custom react hooks vs services (DEV.to discussion)](https://dev.to/chiangs/custom-react-hooks-vs-services-mcm) —
  the core distinction this skill relies on: a hook can only be used inside
  the React tree and can hold state/context; a plain function (service) can
  be used anywhere and is trivially unit-testable. Pure business logic
  (validation, calculation, formatting) should be a plain function;
  state/orchestration belongs in a hook.
- [Path To A Cleaner React Architecture (Part 6) — Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) —
  a deeper treatment of separating business logic from UI components, with
  dependency-injection patterns for larger apps.
- [Business vs Application Logic: how to separate and test your React code](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1) —
  the two-category framing ("business logic" vs "application logic") this
  skill's "Where Business Logic Lives" section is directly based on.
- [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) and
  [TkDodo — Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) —
  the reference pattern for wrapping data-fetching in custom hooks colocated
  with the query itself, rather than scattering fetch calls through
  components.

### 5. Constants vs. utils vs. helpers — [component-organization.md](component-organization.md)

- [Robin Wieruch — React Folder Structure (2026)](https://www.robinwieruch.de/react-folder-structure/) —
  covers the `constants/` vs `utils/` split this skill's naming rules are
  based on.
- General consensus synthesized from multiple community write-ups on React
  project structure (Medium/NamasteDev/Tania Rascia-style guides surfaced
  via search for "React constants folder organization"): constants are
  fixed, non-computed values (styles, breakpoints, public config, route
  paths); utils are pure, side-effect-free, reusable functions; "helper" as
  a term is used inconsistently across teams and most often really means
  "feature-specific util" rather than a distinct category — hence the
  recommendation to fold helpers into a feature's `utils/` rather than
  maintaining a separate, ambiguous `helpers/` folder.
- [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) —
  explains why bundling constants/utils/components behind an `index.ts`
  re-export hurts tree-shaking, dev-server memory, and `tsc`, and causes
  circular-dependency bugs; a barrel is only justified as a package's actual
  public entry point — the direct source for
  [folder-structure.md](folder-structure.md)'s barrel-file anti-pattern.

### 6. Next.js (App Router) specifics — [nextjs-organization.md](nextjs-organization.md)

- [Next.js docs — Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) —
  official position: Next.js is intentionally unopinionated about
  organization; it supports route groups `(name)`, private folders
  `_folder`, colocation, a `src/` directory, and splitting by feature or by
  route.
- [Next.js docs — Routing: Project Organization (colocation)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) —
  detail on how a segment becomes a public route only via `page.tsx`/
  `route.ts`; everything else in that segment can be colocated safely.
- [Next.js Colocation Template — Scalable Folder Structure Guide](https://next-colocation-template.vercel.app/) —
  a worked example template implementing route colocation end to end.

## What this skill deliberately does not duplicate

- `react-best-practices` already covers a brief "Code Organization" note
  (colocating component + hook + helpers + tests) plus all component
  internals, hooks correctness, and state/memoization anti-patterns — this
  skill does not repeat those and instead cross-references it for anything
  about component *internals*.
- `next-best-practices` already covers Next.js file conventions (special
  files, route segments, parallel/intercepting routes, RSC boundaries,
  async APIs) in detail — this skill only touches Next.js insofar as route
  colocation affects *where* application code lives, and defers to
  `next-best-practices` for framework mechanics.
- `onion-architecture` is the backend counterpart — read that one for
  anything about where server-side code lives.

## Changelog

- **1.0.0** (2026-09-21) — Restructured from a flat `SKILL.md` +
  `examples.md` + `references.md` into topic files
  ([folder-structure.md](folder-structure.md),
  [component-organization.md](component-organization.md),
  [nextjs-organization.md](nextjs-organization.md)) plus this README,
  mirroring `onion-architecture`'s layout. Content carried over unchanged
  from the original research pass (compiled 2026-09-21) — no new sources
  added.
