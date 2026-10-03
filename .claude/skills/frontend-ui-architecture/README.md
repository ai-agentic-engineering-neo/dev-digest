# frontend-ui-architecture — sources & rationale

Not loaded at runtime — this is the human-facing record of why SKILL.md says
what it says. See [SKILL.md](SKILL.md) for the rules themselves and
[examples.md](examples.md) for code.

## Version history

- **1.0.0 — 2026-09-28 — initial.** Extracted from `react-best-practices`'
  9-line `Code Organization` section (whose `utils/`/`components/ui/` advice
  didn't match this repo's actual layout) into a dedicated skill, grounded in
  32 external sources plus this repo's own `client/CLAUDE.md`,
  `client/docs/ui-architecture.md`, and `client/INSIGHTS.md`.

## Motivation

`react-best-practices` covered React *behaviour* well (purity, hooks,
memoization, conditional rendering) but only glancingly touched *structure* —
where a new component goes, when to split one, where constants/helpers/types
live. Its one structural section actively contradicted this repo: it
recommended `utils/` and `components/ui/`, folders that don't exist in
`client/`, which uses colocated `helpers.ts` and `src/vendor/ui` instead.
Meanwhile `client/` has a real, consistent architecture — enforced only by
review, not lint — that nothing wrote down in skill form. This skill owns
placement/decomposition; `react-best-practices` was trimmed to keep the
behavioural rules and cross-link here instead of duplicating.

## Rule → source map

| SKILL.md section | Backed by |
|---|---|
| §1 Placement decision tree | Colocation (Dodds); Next.js private-folder convention; Screaming Architecture (Kettmann) |
| §2 Folder anatomy | Repo-internal only (`client/CLAUDE.md`, `client/INSIGHTS.md`) — no single external source states this shape |
| §3 When to split | When to break up a component (Dodds); Thinking in React; The Uphill Battle of Memoization, Why React Re-Renders (TkDodo, Comeau); React Compiler docs |
| §4 Business logic layers | You Might Not Need an Effect, Keeping Components Pure, Reusing Logic with Custom Hooks (react.dev); Practical React Query, Creating Query Abstractions (TkDodo) |
| §5 Constants | FSD `config` segment; bulletproof-react `src/config` (by implication — thinly served by dedicated sources); Why I Don't Like TypeScript Enums (Pocock) |
| §6 Helpers and utils | AHA Programming (Dodds); bulletproof-react project-structure |
| §7 Types | Repo-internal (`client/CLAUDE.md`, `client/INSIGHTS.md`'s `@devdigest/shared` vs `@/vendor/shared` entry) |
| §8 State placement | Choosing the State Structure, Sharing State Between Components, Managing State (react.dev); State Colocation, Application State Management, Prop Drilling (Dodds); React Query as a State Manager (TkDodo) |
| §9 Styles | Repo-internal only — no framework opinion applies; explicitly notes Tailwind guidance doesn't transfer |
| §10 Barrels and imports | Please stop using barrel files (TkDodo); FSD Public API / Slices and Segments; Robin Wieruch's folder-structure post (pro-barrel counterpoint) |
| §11 Server/Client boundary | Server and Client Components, The Server and Client Boundary (Next.js docs); Making Sense of React Server Components (Comeau); The Two Reacts (Abramov) |
| §12 Anti-pattern table | Synthesis of the above, no single new source |

## Sources

30 of 32 verified reachable by fetch on 2026-09-27; the 2 exceptions are
flagged inline below.

**Folder structure & colocation**
- File Structure — React team — https://legacy.reactjs.org/docs/faq-structure.html — legacy docs
- Colocation — Kent C. Dodds — https://kentcdodds.com/blog/colocation — 2019-06-17
- React Folder Structure Best Practices — Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/ — upd. 2026-05-05
- bulletproof-react / project-structure — alan2207 — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Screaming Architecture — Johannes Kettmann — https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25 — 2022-02-25 (⚠ canonical profy.dev URL is dead; this dev.to mirror is the live one)
- Feature-Sliced Design overview — FSD — https://feature-sliced.design/docs/get-started/overview
- Please stop using barrel files — TkDodo — https://tkdodo.eu/blog/please-stop-using-barrel-files — 2024-07-26
- FSD Public API — https://feature-sliced.design/docs/reference/public-api
- FSD Slices and Segments — https://feature-sliced.design/docs/reference/slices-segments

**Component breakdown & sizing**
- Thinking in React — React team — https://react.dev/learn/thinking-in-react
- When to break up a component — Kent C. Dodds — https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components — 2019-07-19
- Presentational and Container Components — Dan Abramov — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 — 2015, retracted 2019 (⚠ Medium blocks automated fetch; content verified via cached/secondary references instead)
- React Component Composition — Robin Wieruch — https://www.robinwieruch.de/react-component-composition/ — 2019-01-30
- bulletproof-react / components-and-styling — https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md
- Writing Resilient Components — Dan Abramov — https://overreacted.io/writing-resilient-components/ — 2019-03-16
- Inversion of Control — Kent C. Dodds — https://kentcdodds.com/blog/inversion-of-control — 2019-11-18
- Atomic Design — Brad Frost — https://bradfrost.com/blog/post/atomic-web-design/ — 2013-06-10
- The Uphill Battle of Memoization — TkDodo — https://tkdodo.eu/blog/the-uphill-battle-of-memoization — 2023-09-30
- Why React Re-Renders — Josh W. Comeau — https://www.joshwcomeau.com/react/why-react-re-renders/ — upd. 2025-12-03
- React Compiler — React team — https://react.dev/learn/react-compiler — v1.0 Oct 2025

**Business logic & hooks**
- Reusing Logic with Custom Hooks — https://react.dev/learn/reusing-logic-with-custom-hooks
- You Might Not Need an Effect — https://react.dev/learn/you-might-not-need-an-effect
- Keeping Components Pure — https://react.dev/learn/keeping-components-pure
- Rules of React — https://react.dev/reference/rules
- Practical React Query — TkDodo — https://tkdodo.eu/blog/practical-react-query — upd. 2023-10-21
- Creating Query Abstractions — TkDodo — https://tkdodo.eu/blog/creating-query-abstractions — 2026-02-23
- AHA Programming — Kent C. Dodds — https://kentcdodds.com/blog/aha-programming — 2020-06-22

**State placement**
- Choosing the State Structure — https://react.dev/learn/choosing-the-state-structure
- Sharing State Between Components — https://react.dev/learn/sharing-state-between-components
- Managing State — https://react.dev/learn/managing-state
- State Colocation will make your React app faster — Kent C. Dodds — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster — 2019-09-23
- Application State Management with React — Kent C. Dodds — https://kentcdodds.com/blog/application-state-management-with-react — 2020-07-21
- Prop Drilling — Kent C. Dodds — https://kentcdodds.com/blog/prop-drilling — 2018-05-21
- Passing Data Deeply with Context — https://react.dev/learn/passing-data-deeply-with-context
- Extracting State Logic into a Reducer — https://react.dev/learn/extracting-state-logic-into-a-reducer
- Scaling Up with Reducer and Context — https://react.dev/learn/scaling-up-with-reducer-and-context
- useReducer vs useState — Robin Wieruch — https://www.robinwieruch.de/react-usereducer-vs-usestate/ — 2019-04-17
- Redux Style Guide — https://redux.js.org/style-guide/
- Deriving Data with Selectors — https://redux.js.org/usage/deriving-data-selectors
- React Query as a State Manager — TkDodo — https://tkdodo.eu/blog/react-query-as-a-state-manager — 2021-08-20
- Does TanStack Query replace client state? — https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state
- bulletproof-react / state-management — https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md

**Constants, types & utils**
- Why I Don't Like TypeScript Enums — Matt Pocock — https://www.totaltypescript.com/why-i-dont-like-typescript-enums
- (plus the FSD `config` segment and bulletproof-react `src/config` entries above — this question is thinly served by dedicated sources and is answered by implication from general project-structure guidance)

**RSC & Next.js-era organization**
- Project structure and organization — Next.js — https://nextjs.org/docs/app/getting-started/project-structure — upd. 2026-07-21
- Server and Client Components — https://nextjs.org/docs/app/getting-started/server-and-client-components — upd. 2026-08-25
- The Server and Client Boundary — https://nextjs.org/docs/app/guides/server-and-client-boundary — upd. 2026-08-25
- React Server Components reference — https://react.dev/reference/rsc/server-components
- Making Sense of React Server Components — Josh W. Comeau — https://www.joshwcomeau.com/react/server-components/ — upd. 2025-05-09
- The Two Reacts — Dan Abramov — https://overreacted.io/the-two-reacts/ — 2024-01-04
- React Conf 2025 Recap — https://react.dev/blog/2025/10/16/react-conf-2025-recap — 2025-10-16
- How to structure a React app in 2026 — Daniele Gazzelloni — https://dangz.dev/blog/how-to-structure-a-react-app-in-2026 — 2026-04-15

## Known disagreements

Surfaced explicitly in SKILL.md rather than papered over, since the "right"
answer genuinely varies by team:

1. **Barrels** — Wieruch, Kettmann, and Gazzelloni write pro-barrel folder
   structures; TkDodo and bulletproof-react argue against barrels entirely
   (bundler tree-shaking cost, circular-import risk); FSD splits the
   difference (one `index.ts` per slice/component, no wildcard re-exports).
   This repo follows the FSD middle ground — see SKILL.md §10.
2. **Container/presentational components** — the pattern Abramov himself
   retracted in 2019, but React Server Components reintroduced structurally
   the same split, with the server/client runtime boundary now doing the
   job the container/presentational naming convention used to do by hand.
3. **Query abstraction shape** — TkDodo's 2020 guidance was "wrap `useQuery`
   in a custom hook"; TkDodo's 2026 "Creating Query Abstractions" post
   argues for `queryOptions` factories instead. This skill follows the 2026
   guidance's direction but describes it in terms of this repo's existing
   per-domain hook files, which already satisfy the same underlying goal
   (one seam between components and the network).
4. **Splitting for performance** — used to be a common justification for
   breaking up a component (to scope `React.memo` boundaries). Much weaker
   now that React Compiler (v1.0, Oct 2025) auto-memoizes render output;
   SKILL.md §3 treats this as a weak reason on its own.

## Repo-internal sources

Rules with no external citation, or where the repo's own convention was the
deciding factor over general advice:

- [`client/CLAUDE.md`](../../../client/CLAUDE.md) — naming conventions
  (PascalCase route-local vs. kebab-case shared), the `src/lib/api.ts` →
  `src/lib/hooks/*` rule, "do not touch" `vendor/*`.
- [`client/docs/ui-architecture.md`](../../../client/docs/ui-architecture.md)
  — the Server/Client boundary census (3 thin `page.tsx` vs. 4 with real
  logic), the TanStack Query hook conventions (query-key shape, invalidation,
  global error toasting), the provider stack order, component colocation.
- [`client/INSIGHTS.md`](../../../client/INSIGHTS.md) — the `FindingsPopover`
  colocate-first-extract-later precedent, the `@devdigest/shared` vs.
  `@/vendor/shared` loophole, the no-floating-UI-library gap behind
  `computeFlip`/`findClipBoundary`.
- [`client/README.md`](../../../client/README.md) — the route map and
  "pages stay thin" framing (qualified by `ui-architecture.md`'s census
  above).
