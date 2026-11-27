---
name: frontend-architecture
description: Use when adding or changing code under client/src - a component, page, hook, constant, helper or style; when deciding which file or folder a threshold, a label, a rule, a formatter or a type belongs in; when the .tsx you are editing already has inline constants, helper functions, hardcoded text or style objects and you are about to add more; when two screens need the same function or component; or when reviewing a frontend diff for structure. Not for server/, reviewer-core/ or e2e/.
---

# Frontend architecture — `client/`

**A `.tsx` file is a view.** At its top level it has imports, a props type and
components, nothing else. Every constant, rule and calculation has a named file
beside the component, as close to its only consumer as possible, and moves up
when a second consumer appears.

No tool checks this: `client/` has no linter and no import checker. The greps
under [Check before you finish](#check-before-you-finish) are the check.

A complete folder to copy from:
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`. Sources,
and where they disagree with this repo's choices: [references.md](references.md).
React mechanics (state, effects, keys) are in `react-best-practices`; routing
and Server Components in `next-best-practices`; tests in
`react-testing-library`.

## Files in a component folder

`src/app/<route>/_components/<Name>/` for a route's own component,
`src/components/<kebab-name>/` for a shared one.

| File | Holds | Never holds |
|---|---|---|
| `<Name>.tsx` | the component, its props type, private sub-components: hook calls, state, event handlers, JSX | a top-level `const`, `let` or lower-case `function`; a number or string that carries a product rule; user-facing text; a style object |
| `constants.ts` | named values that do not depend on props or state: thresholds, limits, lookup maps, key lists, regexes, and the types that describe them | React, hooks, JSX; user-facing text (store the message key) |
| `helpers.ts` | pure functions: rules, decisions, filters, sorts, counts, formatting | React, hooks, `fetch`, `t()`; a bare `Date.now()` (take `now = Date.now()` as the last parameter) |
| `use<Thing>.ts` | named logic that calls hooks: state, effects, refs, context | TanStack Query calls; those live in `src/lib/hooks/` |
| `styles.ts` | the `s` object: style values and style functions | a literal colour or spacing where a CSS variable exists |
| `index.ts` | `export { Name } from "./Name";` | re-exports of `helpers` or `constants` |
| `<Name>.test.tsx`, `helpers.test.ts` | behaviour through the DOM; plain cases for each helper | |

Create a file when you have something to put in it. A page (`page.tsx`) follows
the same rules with the route folder's own `constants.ts`, `helpers.ts` and
`styles.ts`.

## What stays in the component

| Stays in `<Name>.tsx` | Moves |
|---|---|
| `useState`, `useEffect`, a query hook, an event handler | |
| `const shown = visibleFindings(findings, filters)` | the filter, sort or count itself → `helpers.ts` |
| `{lowScore && <Badge … />}` | `score < 50` → `isLowScore(score)` in `helpers.ts`, `LOW_SCORE_BELOW` in `constants.ts` |
| `t(\`list.status.${meta.labelKey}\`)` | `"Changes requested"` → `messages/en/*.json`, its key in a `constants.ts` map |
| `style={s.toolbar}` | `style={{ display: "flex", gap: 10 }}` → `styles.ts` |
| `<Icon.Cpu size={15} />` | nothing: a size passed straight to a UI prop is presentation |

The test for "is this a rule": the line compares against a literal, or filters,
sorts, counts, groups or buckets API data. A rule gets a name in `helpers.ts`,
its literal gets a name in `constants.ts`, and `helpers.test.ts` gets a case.

```tsx
// WRONG — everything in RunHeader.tsx
const VERDICT_LABEL: Record<string, string> = { approve: "Approved" };
const LOW_SCORE_BELOW = 50;
…
{review.score != null && review.score < LOW_SCORE_BELOW && <Badge>low score</Badge>}

// RIGHT — RunHeader/constants.ts
/** Verdict → message key under `prReview.verdict`. */
export const VERDICT_LABEL_KEY: Record<Verdict, string> = { approve: "approved" };
/** A review scoring below this is flagged in the run header. */
export const LOW_SCORE_BELOW = 50;

// RIGHT — RunHeader/helpers.ts (cases in helpers.test.ts)
export function isLowScore(score: number | null | undefined): boolean {
  return score != null && score < LOW_SCORE_BELOW;
}

// RIGHT — RunHeader/RunHeader.tsx
{isLowScore(review.score) && <Badge>{t("run.lowScore")}</Badge>}
```

## When the file you are editing breaks these rules

Some `.tsx` files still have a top-level constant, a helper function, English
text in JSX or inline style objects. If yours does:

1. Everything you add goes in the right file. Create `constants.ts`,
   `helpers.ts`, `styles.ts` and the message key if the folder lacks them.
2. An existing inline declaration that your change edits moves with it.
3. Leave the rest where it is, and name what remains in your summary.

Creating `constants.ts` for your two constants is not a refactor. Rewriting the
file's untouched lines is.

## Where it lives

| Who uses it | Home |
|---|---|
| one component | that component's folder |
| two or more components of one route | the route folder: `constants.ts`, `helpers.ts`, `styles.ts`, `_components/<Name>/` |
| a route and routes nested under it | the nearest route folder above all of them |
| unrelated routes, or anything in `src/components` or `src/lib` | `src/lib/<subject>.ts` for code, `src/components/<kebab-name>/` for UI |

- Start at the top row. Move down a row when the second consumer exists, not
  before.
- Moving means moving the function, its test and every import. No copy, and no
  re-export left behind at the old path.
- A `src/lib` file is named for its subject: `relative-time.ts`,
  `github-urls.ts`, `model-label.ts`. Never `lib/utils.ts`, `lib/helpers.ts` or
  `lib/constants.ts`.
- Search before writing a formatter or a lookup map:
  `grep -rnE "function (format|relative|label)" src --include='*.ts*'`.

## Imports

`pnpm deps:validate` enforces these (rules `lib-and-components-never-import-app`,
`lib-never-imports-components`, `route-never-imports-unrelated-route`,
`component-folder-entered-through-index`, `helpers-and-constants-stay-pure`).

- `src/lib` and `src/components` never import from `src/app`. `src/lib` never
  imports from `src/components`.
- A route never imports from an unrelated route (`app/agents` ↔ `app/repos`).
- A route folder's own files never import from a route nested below it, and
  never from inside a component folder.
- Another component folder is entered only through its `index.ts`:
  `from "../FindingCard"`, never `from "../FindingsPanel/constants"`. Needing
  another folder's constant or helper means it has two consumers: move it down
  a row in the table above.
- Reach shared code as `@/lib/…` and `@/components/…`, not by climbing with
  `../../..`. Inside a route folder use relative paths.
- UI comes from the `@devdigest/ui` barrel, API types from `@devdigest/shared`.

## Data

- A component gets server data from a hook in `src/lib/hooks/<domain>.ts`, and
  `src/lib/api.ts` is the only caller of `fetch`. No `useQuery`, `useMutation`
  or `fetch` in a component, a `helpers.ts` or a `use<Thing>.ts`.
- Do not copy query data into state. Derive it during render through a helper.
- Keep the one pattern: a named hook per query. Do not add `queryOptions`
  factories beside it.

## Tests

- Every function in `helpers.ts` has cases in `helpers.test.ts`: inputs and
  outputs, no render, a fixed `now`. Cases for a helper do not go in
  `<Name>.test.tsx`.
- `<Name>.test.tsx` covers what the user sees and does, not the helper's
  branches again.
- From `client/`: `pnpm exec vitest run <NameFragment>` (a path with `[repoId]`
  matches nothing), then `pnpm typecheck`.

## Check before you finish

From `client/`. First the import rules, which `pnpm deps:validate` checks
mechanically (config: `.dependency-cruiser.cjs`; CI runs it) and which must
print no violation. Checks 2, 3 and 4 below are now covered by it; run the rest
by hand, and your diff must not add a line to any of them.

```sh
pnpm deps:validate
```

```sh
# 1. top-level constants and helper functions in a .tsx
grep -rnE "^(export )?(const|let|var) |^(export )?(async )?function [a-z]" src/app src/components --include='*.tsx' \
  | grep -vE "\.test\.|export const (metadata|viewport|dynamic|revalidate) "
# 2. another component folder's internals
grep -rnE "from ['\"][^'\"]*/[A-Z][A-Za-z]+/(constants|helpers|styles)['\"]" src/app src/components
# 3. shared code importing a route; lib importing components
grep -rnE "from ['\"](@/|(\.\./)+)app/" src/lib src/components
grep -rnE "from ['\"](@/|(\.\./)+)components/" src/lib
# 4. React, Next, TanStack Query or next-intl in a pure file
grep -lE "from ['\"](react|next/|@tanstack|next-intl)" $(find src -name helpers.ts -o -name constants.ts)
# 5. a clock read without a `now` parameter
grep -nE "Date\.now\(\)|new Date\(\)" $(find src -name helpers.ts)
# 6. data access outside src/lib
grep -rnE "\b(fetch|useQuery|useMutation|useInfiniteQuery)\(" src/app src/components --include='*.ts*' | grep -v "\.test\."
```

By reading, because no grep sees it: a comparison against a literal or a
`.filter` / `.sort` / `.reduce` over API data inside JSX or a component body;
English text between JSX tags or in a `title`, `aria-label` or `confirm()`.

## Excuses that are not exceptions

| Excuse | Reality |
|---|---|
| "This file already keeps its constants and strings inline; I'm matching it" | That file is an offender, not a pattern. Your additions go in the right file. |
| "The other labels in this header are hardcoded English" | Yours get message keys. Say in your summary that the old ones remain. |
| "It is one constant" / "It is a three-line function" | Size is not the rule. The kind of code decides the file. |
| "The ticket says no refactor" / "Keep the diff small" | Two new small files are a small diff. Leaving old offenders untouched is how you avoid the refactor. |
| "It is only used here; I'll extract it when it is reused" | Reuse decides how high code lives, not whether it leaves the `.tsx`. |
| "The folder has no `constants.ts`" | Create it. |
| "I need the constant from the other component's folder; importing it is simpler" | Two consumers. Move it to the folder above both. |
| "I'll export the helper from `index.ts`" | `index.ts` exports the component. Shared code moves up. |
| "The helper needs `t()` to build the label" | Return the key and the values. The component calls `t()`. |
| "The component test already exercises the helper" | Then the helper's edge cases cost a render each. Put them in `helpers.test.ts`. |

## Do not over-build

- No empty `constants.ts` or `helpers.ts`, and no file per function.
- No `types.ts` for a props type; it stays in the `.tsx`. A type produced by a
  helper or describing a constant lives in that file.
- No view-model hook per component. A hook exists because the logic calls
  hooks.
- No new top-level folders under `src/` (`utils/`, `features/`, `hooks/`), and
  no `_components/index.ts` that re-exports several folders.
- Do not rename `helpers.ts` to subject names inside a component folder, and do
  not remove the per-component `index.ts`. The sources are split on both; this
  repo chose the current names.
- Do not move code to a shared home for a consumer that does not exist yet.
