# Frontend architecture — sources

The research behind the frontend code-organisation skill for `client/`. Kept as
a reusable catalogue: every entry has the exact URL, what it supports, one
verbatim quote and its limits.

## How this list was built

- Collected 2026-11-26. Every page was fetched that day; nothing is cited from
  memory.
- Quotes are verbatim and were matched against the fetched page text. A second,
  independent pass re-checked 77 of them (21 in part A, 27 in B, 29 in C)
  against the pages; all matched.
- "Summary only" marks a detail that rests on a fetch tool's summary rather
  than on text read verbatim. Do not quote those. "Abstract only" marks a paper
  whose full text was not read.
- Tool and package versions are as published on the collection date.
- Sources were chosen to test the existing layout, not to confirm it. Dissent
  is listed with the same weight as support.
- IDs (`A1`, `A-S1`, …) are stable; cite them from the skill and from reviews.

## A. Structure and placement

Where files and folders go: colocation, route-private folders, promotion on
reuse, barrels, naming.

### Main sources

**A1. Next.js docs — Project structure and organization** · Vercel · updated 2026-07-21
<https://nextjs.org/docs/app/getting-started/project-structure>
- Supports: colocating inside `app` is safe; private folders are optional; three
  organisation strategies are presented as equally valid.
- Quote: "Next.js is **unopinionated** about how you organize and colocate your project files."
- Also: "private folders are not required for colocation"; private-folder uses
  include "Separating UI logic from routing logic."; "choose a strategy that
  works for you and your team and be consistent across the project."
- Limits: endorses no layout. `app/blog/_components/Post.tsx` is only an example
  row. It never says "thin pages".

**A2. bulletproof-react — Project Structure** · alan2207 · undated (master)
<https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/project-structure.md>
- Supports: feature folders with one-way imports (shared → features → app), no
  cross-feature imports, barrels no longer recommended.
- Quote: "the features can only import from shared parts and the app can import from features and shared parts."
- Also: "it is recommended to import the files directly."; "It might not be a
  good idea to import across the features."
- Limits: a hybrid — each feature still has type folders inside it
  (`components/`, `hooks/`, `utils/`). The barrel rationale is Vite
  tree-shaking. The tree is not App Router. The github.com HTML URL returned
  503; use the raw URL.

**A3. Feature-Sliced Design — Layers reference (v2.1)** · FSD core team · undated
<https://feature-sliced.design/docs/reference/layers>
- Supports: keep non-reused code in the page; extract on reuse; shared `lib` is
  not a helpers pile.
- Quote: "If a UI block on a page is not reused, it's perfectly fine to keep it inside the page slice."
- Also: "This folder should not be treated as helpers or utilities"; "A good
  indicator that something needs to be a feature is the fact that it is reused
  on several pages."; "You don't have to use every layer in your project"
- Limits: FSD's full layer vocabulary is heavier than this app needs.

**A4. Feature-Sliced Design — Public API reference** · FSD core team · undated
<https://feature-sliced.design/docs/reference/public-api>
- Supports: one index per slice is a contract, but index files have costs and
  must be limited.
- Quote: "Avoid having index files in segments on layers that have slices."
- Also: "you don't actually forbid anyone from not using it and importing
  directly"; "Having a large amount of index files in a project can slow down
  the development server"
- Limits: pro-index in principle; cites A6 for the costs. Inside a slice it
  says to use relative imports with the full path.

**A5. FSD v2.1 release notes — "Pages come first!"** · FSD core team · 2024-11-13
<https://github.com/feature-sliced/documentation/releases/tag/v2.1>
- Supports: FSD reversed its position; page-local code stays in the page and
  moves down only on reuse.
- Quote: "You do “pages first” by keeping more code in pages."
- Also: "splitting by pages is natural and requires little training"
- Limits: it also says "don't just pile all the code into a single file".

**A6. Please Stop Using Barrel Files** · Dominik Dorfmeister (TkDodo) · 2024-07-26
<https://tkdodo.eu/blog/please-stop-using-barrel-files>
- Supports: app-code barrels cause circular imports and slow dev; only library
  entry points justify them.
- Quote: "if you are writing app code, you’re just making your life harder by putting index.ts files into arbitrary directories."
- Also: Next.js pages "were loading over 11k modules"; after removal "about
  3.5k modules - a reduction of 68%."
- Limits: one project's numbers. Summary only: that a barrel with any
  non-re-export line is not optimisable by `optimizePackageImports`.

**A7. The Vertical Codebase** · Dominik Dorfmeister (TkDodo) · 2026-04-13
<https://tkdodo.eu/blog/the-vertical-codebase>
- Supports: group by domain, not by type; a `utils` directory is arbitrary;
  shared non-domain code belongs to a design system.
- Quote: "Code that changes together should live together."
- Also: "The horizontal split has never made sense to me."; "Choosing the
  correct vertical for each piece of code is hard."; "Having “private” code
  runs the risk of multiple teams re-implementing the same things from scratch."
- Limits: drawn from a very large codebase with monorepo packages. Does not
  discuss index files.

**A8. Colocation** · Kent C. Dodds · 2019-06-17
<https://kentcdodds.com/blog/colocation>
- Supports: the base colocation principle, including tests; a `utils/`
  directory hides dead code.
- Quote: "Place code as close to where it's relevant as possible"
- Also: "we should co-locate our tests files with the file or group of files
  they are testing."
- Limits: predates the App Router. Does not state a "move up to the nearest
  common parent" rule, though it is often cited for one.

**A9. React legacy docs — File Structure FAQ** · React team · undated (archived)
<https://legacy.reactjs.org/docs/faq-structure.html>
- Supports: both feature and type grouping are legitimate; cap nesting; do not
  over-invest.
- Quote: "consider limiting yourself to a maximum of three or four nested folders within a single project."
- Also: "don’t spend more than five minutes on choosing a file structure.";
  "keep files that often change together close to each other."
- Limits: marked "no longer updated"; react.dev has no equivalent page.

**A10. Speeding up the JavaScript ecosystem — the barrel file debacle** · Marvin Hagemeister · 2023-10-08
<https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/>
- Supports: barrels multiply module-loading cost in every test file and tool run.
- Quote: "Having only a handful of barrel files in your code is usually fine, but it gets problematic when every single folder has one."
- Also: "Get rid of all barrel files."
- Limits: synthetic benchmark with empty modules ("lowball numbers"). The quote
  applies directly to a per-component `index.ts` convention.

**A11. How We Achieved 75% Faster Builds by Removing Barrel Files** · Tim Sebastian, Atlassian · 2025-06-26
<https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files>
- Supports: measured gains from removing barrels in the Jira frontend.
- Quote: "Local unit testing became around 50% faster on average, with certain packages seeing up to 10x improvements."
- Limits: extreme scale (90,000+ files changed). "75%" is build minutes per
  commit, not wall-clock time.

**A12. Next.js docs — How to optimize your local development environment** · Vercel · updated 2026-09-02
<https://nextjs.org/docs/app/guides/local-development>
- Supports: official, mild advice against barrels.
- Quote: "Try to import directly from specific files when possible."
- Also: "They can slow down builds because the compiler has to parse them";
  "Turbopack automatically analyzes imports and optimizes them."
- Limits: soft wording. Whether the Turbopack sentence covers app-local barrels
  is not stated.

**A13. How we optimized package imports in Next.js** · Shu Ding, Vercel · 2023-10-13
<https://vercel.com/blog/how-we-optimized-package-imports-in-next-js>
- Supports: the cost of barrel entry points, and the `optimizePackageImports` fix.
- Quote: "you are still paying the price of importing other unneeded modules."
- Limits: about npm packages only; app-local barrels are not addressed.

**A14. Delightful React File/Directory Structure** · Josh W. Comeau · 2022-03-15, updated 2025-12-03
<https://www.joshwcomeau.com/react/file-structure/>
- Supports: the main dissent. Organises by function, uses per-component folders
  with an `index.ts`, and argues barrel cost is irrelevant at normal scale.
- Quote: "Every time you create a component, you have to decide where that component belongs."
- Also: "This is a scale that very few applications will ever hit"; "A helper
  is something specific to a given project."; "Often, the boundaries are blurry"
- Limits: based on his blog (about 1,200 files); admits the boilerplate cost.

**A15. React Folder Structure Best Practices [2026]** · Robin Wieruch · updated 2026-05-05
<https://www.robinwieruch.de/react-folder-structure/>
- Supports: a staged structure, promote/demote at two consumers, a nesting cap,
  and advice against route-private feature folders.
- Quote: "once two or more features need it, it moves up to the shared layer."
- Also: on moving a feature into a private folder under `app/`: "But I’d always
  advice against it"; "My rule of thumb is to avoid nesting more than two
  levels."; "barrel files are getting out of fashion in JavaScript"
- Limits: self-described as opinionated. Uses kebab-case and generic file names
  (`component.js`, `utils.ts`, `constants.ts`).

**A16. Angular style guide** · Angular team (Google) · undated
<https://angular.dev/style-guide>
- Supports: a framework-official rejection of type folders and generic file
  names, plus test colocation.
- Quote: "Avoid overly generic file names like helpers.ts, utils.ts, or common.ts."
- Also: "avoid creating directories like components, directives, and
  services."; "Unit tests should live in the same directory as the
  code-under-test."
- Limits: a different framework; cited as the clearest official statement, not
  as a React authority.

**A17. Epic Programming Style Guide** · Kent C. Dodds / Epic Web · `@epic-web/config` 1.21.0
<https://unpkg.com/@epic-web/config@1.21.0/docs/style-guide.md>
- Supports: dissent against splitting files, against barrels, and against
  PascalCase file names.
- Quote: "Breaking a single file into multiple files should be avoided unless absolutely necessary."
- Also: "Strive to keep the file structure as flat as possible."; "Do **not**
  use barrel files."; "Use kebab-case for file names."
- Limits: terse, little argument, pinned to one package version.

**A18. Next.js docs — Fast Refresh** · Vercel · updated 2025-10-27
<https://nextjs.org/docs/architecture/fast-refresh>
- Supports: the one mechanical reason to move a constant out of a component file.
- Quote: "consider migrating the constant to a separate file and importing it into both files."
- Also: "Remember that imports are case sensitive."
- Limits: narrow — applies when a component file also exports a value imported
  from outside the React tree. Not a general mandate for `constants.ts`.

**A19. Feature-Sliced Design — Slices and segments** · FSD core team · undated
<https://feature-sliced.design/docs/reference/slices-segments>
- Supports: name folders by purpose; no same-layer cross-slice imports.
- Quote: "components, hooks, and types are bad segment names because they aren't that helpful when you're looking for code."
- Limits: does not name `utils`; see A3.

**A20. Feature-Sliced Design — Usage with Next.js** · FSD core team · undated
<https://feature-sliced.design/docs/guides/tech/with-nextjs>
- Supports: an alternative where `app/` is a routing shell that re-exports
  pages kept outside it.
- Quote: "Generally, it is easier to place Next.js folders in the root of the project so that the src folder contains only FSD code"
- Limits: summary only — the re-export example and the warning that an index
  exporting server-only modules can leak into the client graph.

**A21. AHA Programming** · Kent C. Dodds · 2020-06-22 — with **The Wrong Abstraction** · Sandi Metz · 2016-01-20
<https://kentcdodds.com/blog/aha-programming> · <https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction>
- Supports: do not promote or abstract early.
- Quote (Metz): "duplication is far cheaper than the wrong abstraction"
- Also (Dodds): "write the abstraction when it feels right and don't be afraid
  to duplicate code until you get there."
- Limits: about abstraction, not folder placement. Neither states a numeric
  "rule of three".

**A22. Airbnb React/JSX Style Guide** · Airbnb · undated
<https://github.com/airbnb/javascript/blob/master/react/README.md>
- Supports: one component per file, PascalCase file names, the directory-root
  index convention.
- Quote: "Only include one React component per file."
- Also: "Use PascalCase for filenames."
- Limits: class-era; its exception allows multiple stateless components per file.

**A23. Tailwind CSS docs — Styling with utility classes, "Managing duplication"** · Tailwind Labs · v4 docs
<https://tailwindcss.com/docs/styling-with-utility-classes>
- Supports: reuse styles through components, not extracted class lists.
- Quote: "If you can quickly edit all of the duplicated class lists simultaneously, there's no benefit to introducing any additional abstraction."
- Limits: never mentions a `styles.ts` file; applying it to one is an inference.

**A24. Effective React Query Keys** · Dominik Dorfmeister (TkDodo) · 2021-06-13, updated 2022-04-23
<https://tkdodo.eu/blog/effective-react-query-keys>
- Supports: query keys and queries live with their feature, not in a global file.
- Quote: "I keep my Query Keys next to their respective queries, co-located in a feature directory"
- Limits: pre-v5; the example uses `features/<Name>/queries.ts`.

**A25. Vitest docs — Profiling Test Performance** · Vitest team · undated
<https://vitest.dev/guide/profiling-test-performance>
- Supports: barrels inflate test transform work in this stack's test runner.
- Quote: "importing files without barrel file reduces amount of transformed files by ~85%."
- Limits: one illustrative example (a `utils/index.ts` with six modules).

### Supplementary (fetched, lower weight)

- **A-S1.** Next.js Vitest guide · updated 2026-08-25 ·
  <https://nextjs.org/docs/app/guides/testing/vitest> — "test files can also be
  colocated inside the `app` router." Its own example uses `__tests__/`.
- **A-S2.** Redux Style Guide · <https://redux.js.org/style-guide/> — "we
  recommend that most applications should structure files using a "feature
  folder" approach". A different library.
- **A-S3.** Tao of React · Alex Kondov · 2021-01-18 ·
  <https://alexkondov.com/tao-of-react/> — "Group by route/module from the
  start."; recommends an `index.js` per component folder.
- **A-S4.** react.dev — Importing and Exporting Components ·
  <https://react.dev/learn/importing-and-exporting-components> — "it often
  makes sense to start splitting them into different files." No
  one-component-per-file rule.
- **A-S5.** <https://react-file-structure.surge.sh/> — "move files around until
  it feels right". Attributed to Dan Abramov by a linked tweet that was not
  fetched.
- **A-S6.** next-intl App Router setup ·
  <https://next-intl.dev/docs/getting-started/app-router> — `i18n/request.ts`
  and `messages/` locations only.
- **A-S7.** Next.js `optimizePackageImports` API page · updated 2025-12-19 ·
  <https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports>
  — "This feature is currently experimental"; package names only.
- **A-S8.** Vercel agent-skills rule "Avoid Barrel File Imports" ·
  <https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/rules/bundle-barrel-imports.md>
  — impact "CRITICAL", but every example is a third-party package.

### What the sources support

"Consensus", "majority" and "contested" describe the fetched sources only.
Mappings onto this app's paths are inferences, marked as such.

| # | Rule | Sources | Standing |
|---|---|---|---|
| 1 | Single-consumer code lives with its consumer | A1 A3 A5 A8 A9 A-S3 | majority; dissent A14, A15 |
| 2 | Promote on a second real consumer, to the lowest common owner; demote when it drops back to one | A15 A3 A5 A21 | majority; "lowest common owner" is an inference |
| 3 | Imports flow one way: shared code never imports from `app/`, a route never imports another route's private folder | A2 A3 A19 | consensus where a direction is stated; the `_components` mapping is an inference |
| 4 | Route files compose and do not implement | A1 A20 | majority; "thin page" is an inference |
| 5 | No aggregating barrels that re-export several modules | A2 A4 A6 A10 A11 A12 A17 A25 | consensus |
| 6 | A per-component `index.ts` | A4 A6 A15 | contested: for A14 A22 A-S3; against A6 A17 A2 A10 |
| 7 | Unit and component tests sit beside the file under test; e2e at the root | A8 A16 A-S1 A9 | consensus |
| 8 | Cap nesting | A9 A15 A17 | majority, with different numbers |
| 9 | Create a sibling file only when it has content that earns it; props types stay in the component file | A17 A7 A23 | contested; A15 and A14 show sibling files as options, not a mandatory set |
| 10 | Move a non-component export out of a component file when non-React modules import it | A18 | single official source, uncontested |
| 11 | Name shared modules by subject, not `utils` / `helpers` / `common` | A16 A3 A7 A8 A19 | majority; dissent A14 A2 A15 |
| 12 | A shared `components` folder holds domain-agnostic UI only | A7 A3 A2 A-S3 | majority |
| 13 | Query keys and query definitions live with their owner, not in a global keys file | A24 A7 | majority; A2 allows a top-level `api/` |
| 14 | One exported component per file, file named after it | A22 A-S4 A16 | majority; file-name casing contested |

The point of widest agreement is not checkable: pick one scheme, be consistent,
do not over-engineer it (A1, A9, A15, A-S5).

### Where the sources disagree

1. **Feature or route grouping vs. grouping by function.** For: A7, A2, A3, A5,
   A16, A-S2, A-S3. Against: A14 ("categorization is actually really hard").
   The feature side concedes the difficulty (A7), and FSD 2.1 fell back to
   pages as the natural unit (A5).
2. **Where route-specific code lives in Next.js.** A1 is neutral. A5 and A-S3
   keep it in the route. A15 advises against route-private feature folders.
   A20 and A2 treat `app/` as a thin routing layer over code kept elsewhere.
   This is the most direct challenge to a `_components` layout.
3. **Barrels.** Against in app code: A6, A17, A10, A2, A11, A12, A25. For a
   per-folder index: A14, A22, A-S3, A4 (as a contract), A15 (curated only).
   Performance depends on scale; circular imports and the lack of real
   enforcement do not. No source measures a single-re-export `index.ts`.
4. **Splitting a component across sibling files.** For: A15, A14. Against: A17,
   A7, A23. The only mechanical reason is A18, and it is narrow.
5. **`utils` and `helpers` naming.** Uses them: A14, A2, A15. Rejects them:
   A16, A3, A7, A8.
6. **File and folder casing.** PascalCase: A22, A14, the A1 example. kebab-case:
   A17, A15.
7. **Promotion threshold.** Two consumers: A15, A3. Judgement, tolerate
   duplication: A21. A7: shared domain code should become its own vertical.

### Looked for, not found

- A numeric "rule of three" in any fetched source (Fowler's *Refactoring* was
  not fetched).
- An official Next.js rule on thin pages or shared-vs-local placement; the docs
  are explicitly unopinionated.
- Whether Turbopack or `optimizePackageImports` neutralises app-local barrels.
- Barrel cost measured at small or mid scale.
- An argument against per-component folders as such.
- Any source on a `styles.ts` file, or on splitting next-intl messages per route.
- Robin Wieruch's kebab-case article (`/kebab-case/` returned 404).
- Not fetched: shadcn/ui conventions, the Next.js package-bundling guide, the
  bulletproof-react Next.js sample app.

## B. Logic out of the view

What belongs in a component file and what does not: pure functions, custom
hooks, constants, server state, and when not to extract.

The hypothesis tested: a component holds only rendering and event wiring;
constants live in a sibling `constants.ts`; business rules live as pure
functions in a sibling `helpers.ts`; server data is reached only through
TanStack Query hooks. Result: the principles hold, three parts are too strong.

- "Only through query hooks" is outdated: the TanStack Query maintainer now
  prefers `queryOptions` factories to custom hooks (B10, B11).
- A sibling `constants.ts` / `helpers.ts` as a default has no authoritative
  backing; strong sources keep single-use code in the same file and reject the
  name `helpers` (B8, B20, B21, B26).
- "Stateful logic becomes a hook" is supported, but react.dev warns against
  extracting every duplicated bit (B1).

### Main sources

**B1. Reusing Logic with Custom Hooks** · React team · undated
<https://react.dev/learn/reusing-logic-with-custom-hooks>
- Supports: a hook is only for logic that calls hooks; pure logic stays a plain
  function.
- Quote: "Functions that don't call Hooks don't need to be Hooks."
- Limits extraction: "You don't need to extract a custom Hook for every little
  duplicated bit of code. Some duplication is fine." Rejects `useMount`-style
  wrappers; "It's up to you how and where to choose the boundaries of your code."

**B2. You Might Not Need an Effect** · React team · undated
<https://react.dev/learn/you-might-not-need-an-effect>
- Supports: derived values are computed during render, not stored or synced.
- Quote: "When something can be calculated from the existing props or state, don't put it in state. Instead, calculate it during rendering."
- Also: "The fewer raw useEffect calls you have in your components, the easier
  you will find to maintain your application."

**B3. Keeping Components Pure** · React team · undated
<https://react.dev/learn/keeping-components-pure>
- Supports: render is a pure calculation; side effects go in event handlers.
- Quote: "In React, side effects usually belong inside event handlers."
- Limits: says nothing about file layout.

**B4. Choosing the State Structure** · React team · undated
<https://react.dev/learn/choosing-the-state-structure>
- Supports: no redundant state; derive instead.
- Quote: "You can always calculate fullName from firstName and lastName during render, so remove it from state."

**B5. Rules of React** · React team · undated
<https://react.dev/reference/rules>
- Supports: components and hooks must be pure and idempotent.
- Quote: "Side effects should not run in render, as React can render components multiple times to create the best possible user experience."

**B6. React Compiler — Introduction** · React team · undated ("now stable")
<https://react.dev/learn/react-compiler/introduction>
- Supports: with the compiler, manual memoisation is an escape hatch.
- Quote: "For new code, we recommend relying on the compiler for memoization and using useMemo/useCallback where needed to achieve precise control."
- Limits: "React Compiler only memoizes React components and hooks, not every
  function" — an extracted helper is not cached by being extracted. Applies only
  if the project enables the compiler.

**B7. Removing Effect Dependencies** · React team · undated
<https://react.dev/learn/removing-effect-dependencies>
- Supports: static objects and functions belong at module scope, not in the
  component body.
- Quote: "If the object does not depend on any props and state, you can move that object outside your component"
- Limits: the motive is Effect dependencies; "outside your component" is not
  "another file".

**B8. Modularizing React Applications with Established UI Patterns** · Juntao Qiu, martinfowler.com · 2023-02-16
<https://martinfowler.com/articles/modularizing-react-apps.html>
- Supports: React is the view only; state logic goes to hooks, domain logic to
  plain objects and functions in layers.
- Quote: "have the user interface as thin as possible, sink the logic into a supporting model layer, and data access into another"
- Limits (its own): "Note that it's not a set-in-stone rule. Keep things all
  together nice and tidy for small and cohesive components". Predates Server
  Components.

**B9. How to convert your existing Redux containers to Hooks** · Zain Sajjad, LogRocket · 2019-05-05
<https://blog.logrocket.com/convert-existing-redux-containers-hooks/>
- Supports: Dan Abramov withdrew the presentational/container split.
- Quote (Abramov's 2019 update, reproduced): "In particular, I don't suggest splitting your components like this anymore."
- Limits: secondary reproduction; the original Medium article returned 403.

**B10. Creating Query Abstractions** · Dominik Dorfmeister (TkDodo) · 2026-02-23
<https://tkdodo.eu/blog/creating-query-abstractions>
- Supports: the first abstraction for a query is a `queryOptions` factory, not
  a custom hook.
- Quote: "Since v5, my preferred way to create Query abstractions is not with custom hooks anymore but with queryOptions."
- Limits: hooks remain allowed, "but they should likely be built on top of
  queryOptions". Reason: hooks cannot run on the server, in loaders or in
  prefetching.

**B11. The Query Options API** · TkDodo · 2024-01-17
<https://tkdodo.eu/blog/the-query-options-api>
- Supports: key and queryFn belong together in one factory.
- Quote: "I would even take it to a point where custom hooks won't be my first choice for abstractions."
- Also: the heading "Separating QueryKey from QueryFunction was a mistake",
  revising B13.

**B12. Practical React Query** · TkDodo · 2020-11-16, updated 2023-10-21
<https://tkdodo.eu/blog/practical-react-query>
- Supports: keep fetching out of the UI; do not copy query data to local state.
- Quote: "You can keep the actual data fetching out of the ui, but co-located with your useQuery call."
- Limits: its "create custom hooks" advice is superseded by B10 and B11.

**B13. Effective React Query Keys** · TkDodo · 2021-06-13, updated 2022-04-23
<https://tkdodo.eu/blog/effective-react-query-keys> (same page as A24)
- Supports: one key factory per feature, colocated, not a global keys file.
- Quote: "I don't believe that storing all your Query Keys globally in /src/utils/queryKeys.ts will make things better."

**B14. React Query Data Transformations** · TkDodo · 2021-03-10, updated 2023-10-21
<https://tkdodo.eu/blog/react-query-data-transformations>
- Supports: derive data with `select`; an expensive transform is a stable
  module-level function.
- Quote: "you can memoize it either with useCallback, or by extracting it to a stable function reference"

**B15. Advanced Server Rendering** · TanStack Query docs · v5
<https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr>
- Supports: with React Query, Server Components only prefetch.
- Quote: "From the React Query perspective, treat Server Components as a place to prefetch data, nothing more."
- Limits: the same page advises a new Server Components app to "avoid bringing
  in React Query until you actually need it".

**B16. Server and Client Components** · Next.js docs · updated 2026-10-05
<https://nextjs.org/docs/app/getting-started/server-and-client-components>
- Supports: data access stays in Server Components; state, effects and custom
  hooks need Client Components.
- Quote: "Fetch data from databases or APIs close to the source."
- Limits: documents "latest" (v16.x), not the v15-pinned docs.

**B17. Google TypeScript Style Guide** · Google · undated
<https://google.github.io/styleguide/tsguide.html>
- Supports: CONSTANT_CASE is for module-level immutable values; export
  individual constants.
- Quote: "Only symbols declared on the module level, static fields of module level classes, and values of module level enums, may use CONST_CASE."
- Also: "Do not create container classes with static methods or properties for
  the sake of namespacing."; "Code must not use const enum; use plain enum
  instead."
- Limits: no mention of magic numbers, const assertions or util files.

**B18. Airbnb JavaScript Style Guide, rule 23.10** · Airbnb · undated
<https://github.com/airbnb/javascript> (read via the raw `README.md`)
- Supports: uppercase only exported, truly immutable constants.
- Quote: "uppercasing should not be used for constants within a file. It should be used for exported constants however."
- Limits: conflicts with B17 on non-exported module constants. No rule on where
  constants live.

**B19. TypeScript Handbook — Enums, "Objects vs Enums"** · Microsoft · undated
<https://www.typescriptlang.org/docs/handbook/enums.html>
- Supports: an `as const` object can replace an enum.
- Quote: "In modern TypeScript, you may not need an enum when an object with as const could suffice"

**B20. Avoid package names like base, util, or common** · Dave Cheney · 2019-01-08
<https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common>
- Supports: `utils` / `helpers` modules are named for what they contain, not
  what they provide.
- Quote: "These packages contain an assortment of unrelated functions, as such their utility is hard to describe in terms of what the package provides."
- Limits: Go packages; applied here by analogy.

**B21. Colocation** · Kent C. Dodds · 2019-06-17
<https://kentcdodds.com/blog/colocation> (same page as A8)
- Supports: premature moves to `utils/` create orphaned code.
- Quote: "If instead you had just left that function directly in the file that used it, the story would be completely different."

**B22. AHA Programming** · Kent C. Dodds · 2020-06-22
<https://kentcdodds.com/blog/aha-programming> (same page as A21)
- Supports: abstract when the shape is known, not on a schedule.
- Quote: "you shouldn't be dogmatic about when you start writing abstractions but instead write the abstraction when it feels right"

**B23. The Wrong Abstraction** · Sandi Metz · 2016-01-20
<https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction> (same page as A21)
- Supports: a wrong shared abstraction costs more than duplication; inline it
  back.
- Quote: "duplication is far cheaper than the wrong abstraction"

**B24. When to break up a component into multiple components** · Kent C. Dodds · 2019-07-19
<https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components>
- Supports: do not split until there is a concrete problem.
- Quote: "don't be afraid of a growing component until you start experiencing real problems"
- Limits: about splitting components, not extracting pure logic.

**B25. A Philosophy of Software Design vs Clean Code** · John Ousterhout and Robert C. Martin · 2024–2025
<https://github.com/johnousterhout/aposd-vs-clean-code>
- Supports: over-decomposition produces shallow, entangled units.
- Quote: "However, like most ideas in software design, decomposition can be taken too far."
- Limits: Martin dissents in the same document.

**B26. Locality of Behaviour** · Carson Gross · 2020-05-29
<https://htmx.org/essays/locality-of-behaviour/>
- Supports: behaviour should be readable at the point of use.
- Quote: "The behaviour of a unit of code should be as obvious as possible by looking only at that unit of code"
- Limits: written for htmx; the author calls it a "subjective tradeoff".

**B27. Guiding Principles** · Testing Library · updated 2020-11-04
<https://testing-library.com/docs/guiding-principles>
- Supports: component tests exercise behaviour through the DOM.
- Quote: "The more your tests resemble the way your software is used, the more confidence they can give you."

**B28. Testing Implementation Details** · Kent C. Dodds · 2020-08-17
<https://kentcdodds.com/blog/testing-implementation-details>
- Supports: testing internals breaks on refactor and misses real breakage.
- Quote: "Implementation details are things which users of your code will not typically use, see, or even know about."

### Supplementary (fetched, quotes verified, narrower or lower weight)

- **B29.** Humble Object · Martin Fowler · 2020-04-29 ·
  <https://martinfowler.com/bliki/HumbleObject.html> — "move as much as logic
  as possible out of the hard-to-test element" (typo in the source).
- **B30.** Static vs Unit vs Integration vs E2E Tests · Kent C. Dodds ·
  2021-06-03 ·
  <https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests> —
  "pure functions are the BEST for unit testing".
- **B31.** How to test custom React hooks · Kent C. Dodds · 2020-03-22 ·
  <https://kentcdodds.com/blog/how-to-test-custom-react-hooks> — test a hook
  through a real usage; `renderHook` for complicated hooks.
- **B32.** Why custom React hooks could destroy your app performance · Nadia
  Makarevich · 2022-01-24 ·
  <https://www.developerway.com/posts/why-custom-react-hooks-could-destroy-your-app-performance>
  — "Every state change in a hook, whether it affects its return value or not,
  will cause the "host" component to re-render." Pre-compiler.
- **B33.** Headless Component · Juntao Qiu · 2023-11-07 ·
  <https://martinfowler.com/articles/headless-component.html> — a hook
  "responsible solely for logic and state management without prescribing any
  specific UI".
- **B34.** React Hooks: a lightweight alternative to container components ·
  Jordan Hurt, Fullstory · 2022-06-07 ·
  <https://www.fullstory.com/blog/react-hooks-a-lightweight-alternative-to-container-components/>
  — names the "view model hook"; "mostly a matter of personal preference".
- **B35.** TypeScript 5.8 release notes · Microsoft · 2025 ·
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html>
  — `--erasableSyntaxOnly` rejects `enum` declarations.
- **B36.** Why I don't like TypeScript enums · Matt Pocock · 2024-08-14 ·
  <https://www.totaltypescript.com/why-i-dont-like-typescript-enums> — "But I
  wouldn't add an enum to a fresh codebase."
- **B37.** ESLint `no-magic-numbers` · <https://eslint.org/docs/latest/rules/no-magic-numbers>
  — "They should preferably be replaced by named constants." Rule is frozen.
- **B38.** Not-Always-Best Practices · Dave Kilian · 2016-02 ·
  <https://davekilian.com/best-practices.html> — "Using constants where they're
  not needed obfuscates your codebase."
- **B39.** Package names · Sameer Ajmani, Go team · 2015-02-04 ·
  <https://go.dev/blog/package-names> — "Packages named util, common, or misc
  provide clients with no sense of what the package contains."
- **B40.** Policy on util packages · Brandur Leach · 2023-03-12 ·
  <https://www.brandur.org/fragments/policy-on-util-packages> — "A general util
  package is not allowed." Allows concept-scoped modules.
- **B41.** Goodbye, Clean Code · Dan Abramov · 2020-01-11 ·
  <https://overreacted.io/goodbye-clean-code/> — "My code traded the ability to
  change requirements for reduced duplication, and it was not a good trade."
- **B42.** The WET Codebase · Dan Abramov, talk transcript · 2019 ·
  <https://www.deconstructconf.com/2019/dan-abramov-the-wet-codebase>
- **B43.** John Carmack on Inlined Code ·
  <http://number-none.com/blow/john_carmack_on_inlined_code.html> — even the
  "inline it" voice says "figure out how to factor blocks out into pure
  functions".
- **B44.** React Query Selectors, Supercharged · TkDodo · 2025-08-04 ·
  <https://tkdodo.eu/blog/react-query-selectors-supercharged> — "The key is to
  pass a stable reference to select".
- **B45.** Deriving Client State from Server State · TkDodo · 2025-09-01 ·
  <https://tkdodo.eu/blog/deriving-client-state-from-server-state> — heading
  "Don't Sync State - Derive It".
- **B46.** Query Options · TanStack Query docs ·
  <https://tanstack.com/query/latest/docs/framework/react/guides/query-options>
  — "You can define all possible options for a query in one place".
- **B47.** Fetching Data · Next.js docs (latest) ·
  <https://nextjs.org/docs/app/getting-started/fetching-data> — "You can use a
  community library like SWR or React Query to fetch data in Client Components."
- **B48.** Rendering translations · next-intl docs ·
  <https://next-intl.dev/docs/usage/translations> — translations are consumed
  "from within React components".
- **B49.** Translations outside of React components · Jan Amann · 2023-04-21 ·
  <https://next-intl.dev/blog/translations-outside-of-react-components> — "we
  can format messages during the rendering phase of React".
- **B50.** `useMemo` reference · React team ·
  <https://react.dev/reference/react/useMemo> — "There is no benefit to
  wrapping a calculation in useMemo in other cases."
- **B51.** Gerrit `constants/README.md` ·
  <https://gerrit.googlesource.com/gerrit/+/refs/heads/master/polygerrit-ui/app/constants/README.md>
  — a shared constants folder scoped to "constants used across files". One
  project's convention.

### What the sources support

| # | Rule | Sources | Standing |
|---|---|---|---|
| 1 | No derived state: compute in render or `select`, never `useState` + `useEffect` | B2 B4 B45 | consensus |
| 2 | Render is pure; side effects live in event handlers, Effects are the last resort | B3 B5 | consensus |
| 3 | Logic that calls no hooks is a plain function, no `use` prefix, defined outside the component | B1 B7 | consensus; same file or sibling file is not settled |
| 4 | Extract a custom hook when the logic uses state, effects or context and has a nameable purpose; do not wrap a lone `useState` | B1 B2 B33 | consensus; re-render cost B32 |
| 5 | Each query's key and queryFn are defined once, together, per feature | B10 B11 B13 B46 | majority; wrapping it in a custom hook is contested (B10 B11 vs B12) |
| 6 | Do not copy query data into local state; an expensive selector is a stable module-level function | B12 B14 B44 B45 | consensus |
| 7 | Server Components may fetch and shape data with no hooks; if React Query owns the data they only prefetch it | B15 B16 B47 | consensus among official docs |
| 8 | Values that do not depend on props or state are declared at module scope | B7 B17 | consensus |
| 9 | CONSTANT_CASE only for module-level, deeply immutable values; export individual constants | B17 B18 | consensus; uppercase for non-exported constants contested |
| 10 | Prefer an `as const` object and a derived union to a TS `enum`; never `const enum` | B19 B35 B36 B17 | majority |
| 11 | Name a literal when its meaning is not obvious or it recurs; do not wrap self-explanatory literals | B37 B38 | majority, thin sourcing |
| 12 | No catch-all `utils` / `helpers` / `common` module; a single-use function stays with its caller | B20 B21 B39 B40 | majority; a per-component `helpers.ts` is contested |
| 13 | Do not extract pre-emptively; split when size, reuse or testing makes it painful; inline back a wrong abstraction | B1 B8 B21 B22 B23 B24 B25 B41 B42 | consensus, and a direct limit on the hypothesis |
| 14 | Pure functions get plain unit tests; components get behaviour tests through the DOM; hooks are tested through a component | B8 B27 B28 B29 B30 B31 | consensus on components, majority on hooks |
| 15 | Helpers return data or keys, not formatted strings; messages are formatted during render | B48 B49 | consensus within next-intl's docs |
| 16 | With React Compiler on, `useMemo` / `useCallback` are escape hatches; the compiler does not memoise plain helpers | B6 B50 | consensus, conditional on the compiler |

Inferences, stated by no source: user-visible strings do not belong in
`constants.ts` (follows from rule 15); for values shared with the API, derive
the union from the shared Zod schema instead of re-declaring it.

### Where the sources disagree

1. **Custom query hooks vs `queryOptions` factories.** For hooks: B12, B13
   (2020–2021). Against hooks as the default: B10, B11 (2024–2026). What
   survives is "query config defined once per resource", not "wrapped in a hook".
2. **Split by kind into sibling files vs one file.** For separation: B8, B29,
   B30. Against a default split: B8's own caveat, B21, B26, B25, B24. No source
   recommends a fixed component / constants / helpers / hook file set; the
   split is defensible as a threshold-triggered refactor, not a template.
3. **`helpers.ts` / `utils` as names.** Against: B20, B39, B40, B21. No
   credible source defends a generic name. Scoping it to one component limits
   the dumping-ground risk (inference), but the naming critique stands.
4. **Presentational/container split.** Withdrawn as a rule (B9); "personal
   preference" (B34); B8 and B33 still argue for a thin view. Reconciliation
   (inference): separate the logic, do not mandate a second component or a
   view-model hook per component.
5. **Constant naming and enums.** B17 allows CONSTANT_CASE for any module-level
   constant and permits plain `enum`; B18 reserves uppercase for exports; B19,
   B35, B36 lean to `as const`. A skill has to pick one.
6. **Hook extraction vs render cost.** State hidden in a hook re-renders its
   host (B32); the compiler does not cache plain functions (B6).

### Looked for, not found

- Dan Abramov's original Medium article (403); quoted only via B9.
- Google Testing Blog, "Functional Core, Imperative Shell" (captcha), and Gary
  Bernhardt's screencast (video only). The pattern is represented by B29, B43.
- patterns.dev container/presentational page (DNS failure).
- Any authoritative React/TypeScript source for or against a per-component
  `constants.ts`.
- A React-team source on over-extracting hooks beyond B1's own caveats.
- An authoritative source for a view-model hook per component.
- Any statement that React Compiler changes where constants or helpers live.
- Next.js 15-pinned docs (B16 and B47 are "latest", v16.x).

## C. Enforcement and prior art

How placement rules are checked mechanically, what published React rule sets
for AI agents contain, and what is known about making agent rules stick.

### Main sources

**C1. dependency-cruiser — rules reference** · sverweij · v18.9.0
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>
- Supports: rules are regex `from` / `to` conditions on the module graph;
  type-only imports are a distinguishable dependency type.
- Quote: "as 'type only' - only available for TypeScript sources, only for tsPreCompilationDeps !== false."
- Limits: paths are regexes, not globs.

**C2. dependency-cruiser — CLI reference (`--baseline`, `--ignore-known`)** · v18.9.0
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md>
- Supports: a built-in known-violations baseline with a mode that can only
  shrink.
- Quote: "\"shrink-only\": makes --baseline only _remove_ existing violations, and not add any new ones."
- Limits: `--baseline` is the recommended form "as of 18.3.0";
  `depcruise-baseline` is deprecated.

**C3. dependency-cruiser — FAQ and options reference**
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md> ·
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md>
- Supports: its limits — nothing finer than modules, no variable imports,
  type-only edges invisible by default.
- Quote: "By default dependency-cruiser does not take dependencies between typescript modules into account that don't exist after compilation to JavaScript."
- Also: on finer-than-module granularity, "No. It's unlikely to grow that in
  the future either."

**C4. AGENTS.md outperforms skills in our agent evals** · Jude Gao, Vercel · 2026-01-27
<https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals>
- Supports: on-demand skills often are not invoked; always-on context won.
- Quote: "In 56% of eval cases, the skill was never invoked."
- Limits: evals covered Next.js 16 API knowledge, not code-organisation rules.
  Pass rates: 53% baseline, 53% skill, 79% skill plus explicit instruction,
  100% AGENTS.md index. Vendor-run.

**C5. Skill authoring best practices** · Anthropic · undated
<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Supports: concise, progressive disclosure, validator loops, evals first.
- Quote: "Keep the `SKILL.md` body under 500 lines for optimal performance."
- Also: "Only add context Claude doesn't already have"; "Run validator → fix
  errors → repeat".

**C6. Agent Skills specification** · agentskills.io · undated
<https://agentskills.io/specification>
- Supports: format limits and token budgets.
- Quote: "Keep your main `SKILL.md` under 500 lines. Move detailed reference material to separate files."
- Also: name max 64 chars, description max 1024, body "< 5000 tokens
  recommended".

**C7. Best practices for skill creators** · agentskills.io · undated
<https://agentskills.io/skill-creation/best-practices>
- Supports: dissent against exhaustive skills; gotchas are the highest-value
  content.
- Quote: "Overly comprehensive skills can hurt more than they help"
- Limits: asserted, not measured on the page.

**C8. SkillsBench** · Li et al. · arXiv 2602.12670 v4, 2026-06-14 · abstract only
<https://arxiv.org/abs/2602.12670>
- Supports: curated skills help; small focused ones beat exhaustive ones.
- Quote: "Focused Skills with at most three modules outperform larger or exhaustive bundles"
- Limits: 87 tasks, 8 domains; not React-specific.

**C9. Evaluating AGENTS.md** · Gloaguen et al. (ETH) · arXiv 2602.11988 v3, 2026-09-29 · abstract only
<https://arxiv.org/abs/2602.11988>
- Supports: dissent — context files do not generally raise success and cost
  more, though instructions are followed.
- Quote: "providing context files does not generally improve task success rates, while increasing inference cost by over 20% on average."
- Limits: about always-on repo files, not skills. Conclusion: "useful for
  specifying non-standard coding practices".

**C10. How Many Instructions Can LLMs Follow at Once?** · Jaroslawicz et al. · arXiv 2507.11538, 2025-07 · abstract only
<https://arxiv.org/abs/2507.11538>
- Supports: adherence degrades with instruction count.
- Quote: "even the best frontier models only achieve 68% accuracy at the max density of 500 instructions."
- Limits: a keyword-inclusion task, not coding rules; mid-2025 models.

**C11. Vercel `react-best-practices` skill** · vercel-labs/agent-skills · v1.0.0, 2026-01
<https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md>
- Supports: the best-known React agent rule set is performance-only and
  impact-ordered.
- Quote: "Contains 70 rules across 8 categories, prioritized by impact to guide automated refactoring and code generation."
- Limits: SKILL.md is 149 lines; the compiled AGENTS.md is 3,810 lines. Nothing
  on where constants, helpers or business logic go.

**C12. Introducing: React Best Practices** · Shu Ding and Andrew Qu, Vercel · 2026-01-14
<https://vercel.com/blog/introducing-react-best-practices>
- Supports: the rationale for ordering rules by impact.
- Quote: "It includes 40+ rules across 8 categories, ordered by impact, from CRITICAL (eliminating waterfalls, reducing bundle size) to incremental (advanced patterns)."
- Limits: no evidence that agents follow it.

**C13. Official Feature-Sliced Design skill** · feature-sliced/skills · FSD v2.1
<https://github.com/feature-sliced/skills/blob/master/feature-sliced-design/SKILL.md>
- Supports: the closest prior art for a code-placement skill — decision tree,
  placement table, MUST / SHOULD / AVOID, linter step, evals.
- Quote: "Technical-role names like `types.ts`, `utils.ts`, `helpers.ts` mix unrelated concerns in a single file and reduce cohesion."
- Limits: 511 lines plus 9 reference files and an `evals/` folder. Assumes FSD
  layers.

**C14. bulletproof-react — Project Structure** · alan2207
<https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md> (same doc as A2)
- Supports: the one-way flow is enforced with `import/no-restricted-paths` zones.
- Quote: "It might not be a good idea to import across the features. Instead, compose different features at the application level."
- Limits: needs ESLint; one zone is hand-written per feature.

**C15. awesome-cursorrules — Next.js (React, TypeScript)** · PatrickJS · undated
<https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/nextjs-react-typescript-cursorrules-prompt-file.mdc>
- Supports: the typical community rule file — flat bullets, no priorities;
  helpers and static content stay in the component file.
- Quote: "File structure: Exported component, subcomponents, helpers, static content, types."
- Limits: 75 lines, no rationale, no enforcement.

**C16. Next.js docs — How Next.js supports AI coding agents**
<https://nextjs.org/docs/app/guides/ai-agents>
- Supports: official Next.js agent guidance covers docs lookup and workflow
  skills, not code organisation.
- Quote: "Framework knowledge comes from the bundled docs, not from Skills."
- Limits: applies to Next 16.2+.

**C17. JS Boundaries (`eslint-plugin-boundaries`) — `dependencies` rule** · javierbrea · v7.4.5
<https://www.jsboundaries.dev/docs/rules/dependencies/>
- Supports: element-type policies; separates type from value imports; can
  target external packages.
- Quote: "This is useful in TypeScript projects, for example to allow type-only imports while disallowing value imports."
- Limits: an ESLint plugin. External packages are skipped unless
  `checkAllOrigins: true`.

**C18. `eslint-plugin-react-hooks` reference** · React team · v7.1.1
<https://react.dev/reference/eslint-plugin-react-hooks>
- Supports: the `recommended` preset now carries React Compiler rules.
- Quote: "React Compiler diagnostics are automatically surfaced by this ESLint plugin, and can be used even if your app hasn't adopted the compiler yet."
- Limits: requires ESLint.

**C19. React Compiler v1.0** · Tan, Savona, Zhang · 2025-10-07
<https://react.dev/blog/2025/10/07/react-compiler-1>
- Supports: compiler lint rules moved into the hooks plugin.
- Quote: "Compiler-powered lint rules ship in `eslint-plugin-react-hooks`'s `recommended` and `recommended-latest` preset."

**C20. Thresholds for size and complexity metrics** · Yamashita et al. · IEEE QRS 2016 · abstract only
<https://www.swag.uwaterloo.ca/www/publications/thresholds-for-size-and-complexity-metrics-a-case-study-from-the-perspective-of-defect-density.html>
- Supports: evidence against hard size limits.
- Quote: "risk thresholds for size and complexity metrics have to be used with caution if at all."
- Limits: Java, file level, 2016.

**C21. ESLint `max-lines` and `max-lines-per-function`** · ESLint 10.15.0
<https://eslint.org/docs/latest/rules/max-lines> ·
<https://eslint.org/docs/latest/rules/max-lines-per-function>
- Supports: size rules exist (defaults 300 and 50) and admit there is no
  objective limit.
- Quote: "there is not an objective maximum number of lines considered acceptable in a file"

**C22. SonarJS rule S138 (source)** · SonarSource
<https://github.com/SonarSource/SonarJS/blob/master/packages/analysis/src/jsts/rules/S138/rule.ts>
- Supports: a major analyser exempts React function components from its
  function-length rule.
- Quote: "return knowledge.startsWithCapital && knowledge.returnsJSX;"

**C23. ESLint `no-restricted-imports` and `no-magic-numbers`**
<https://eslint.org/docs/latest/rules/no-restricted-imports> ·
<https://eslint.org/docs/latest/rules/no-magic-numbers> (same page as B37)
- Supports: per-package import bans with a type-import escape hatch; the
  magic-number rule is noisy by default.
- Quote: "It applies to static imports only, not dynamic ones."

**C24. How Claude remembers your project** · Anthropic · undated
<https://code.claude.com/docs/en/memory>
- Supports: instruction files are context, not enforcement; length reduces
  adherence.
- Quote: "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
- Also: "To block an action regardless of what Claude decides, use a PreToolUse
  hook instead."

**C25. Writing a good CLAUDE.md** · Kyle, HumanLayer · 2025-11-25
<https://www.humanlayer.dev/blog/writing-a-good-claude-md>
- Supports: dissent — do not put lint-checkable style rules in agent
  instructions.
- Quote: "Never send an LLM to do a linter's job."
- Limits: opinion piece.

### Supplementary (fetched)

- **C-S1.** Steiger v0.10.0 · <https://github.com/feature-sliced/steiger> —
  "Currently, Steiger is not extendable with more rules"; beta.
- **C-S2.** ArchUnitTS (`archunit` 2.5.5) ·
  <https://github.com/LukasNiessen/ArchUnitTS> — architecture rules as Vitest
  tests; needs `globals: true`.
- **C-S3.** ts-arch (`tsarch` 5.4.1, last release 2024-12) ·
  <https://github.com/ts-arch/ts-arch> — Jest-oriented.
- **C-S4.** knip 6.48.0 · <https://knip.dev> — "Knip finds and fixes unused
  dependencies, exports and files."
- **C-S5.** Nx — Enforce module boundaries ·
  <https://nx.dev/docs/features/enforce-module-boundaries> — a lint rule for
  ESLint or Oxlint; needs an Nx workspace.
- **C-S6.** `import/no-restricted-paths` (eslint-plugin-import 2.32.0) ·
  <https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md>
- **C-S7.** `react/no-unstable-nested-components` (eslint-plugin-react 7.37.5) ·
  <https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unstable-nested-components.md>
- **C-S8.** Next.js 15.5 blog · <https://nextjs.org/blog/next-15-5> — "the
  `next lint` command shows a deprecation warning and will be removed in
  Next.js 16."
- **C-S9.** GitLab Vue guide · <https://docs.gitlab.com/development/fe_guide/vue/>
  — "Do move business logic to separate files, so you can test them separately
  from your component."
- **C-S10.** Sentry frontend handbook · <https://develop.sentry.dev/frontend/> —
  "Put files in app/views/ when the component can not be reused in other parts
  of the codebase."; "Don't use an index file just to re-export."
- **C-S11.** Google TypeScript style guide ·
  <https://google.github.io/styleguide/tsguide.html> (same page as B17) —
  "Generally minimize the exported API surface of modules."
- **C-S12.** Biome 2.6.9 `noRestrictedImports` ·
  <https://biomejs.dev/linter/rules/no-restricted-imports/>. Summary only: the
  rule list also has `noNestedComponentDefinitions`,
  `noExcessiveLinesPerFunction`, `noMagicNumbers`, `noImportCycles`.
- **C-S13.** Oxlint 1.95.0 · <https://oxc.rs/docs/guide/usage/linter/rules.html>
  — summary only: ports of `no-restricted-imports`, `max-lines`,
  `no-magic-numbers`, `react/no-unstable-nested-components`; JS plugins "are
  currently in alpha".

### Enforcement options for a frontend without ESLint

| Tool | Needs ESLint | Sees type-only imports | Can ban a package per folder | In-file rules | Baseline | Status |
|---|---|---|---|---|---|---|
| dependency-cruiser | no, own CLI | yes, with `tsPreCompilationDeps` | yes | no | built in, shrink-only | active |
| eslint-plugin-boundaries | yes | yes | yes, with `checkAllOrigins` | no | none documented | active |
| ESLint `no-restricted-imports` | yes, or Biome/Oxlint ports | `allowTypeImports` | yes, per config block | no | no | core |
| `import/no-restricted-paths` | yes | not stated | no, file zones | no | no | last release 2025-06 |
| Nx module boundaries | ESLint or Oxlint, plus Nx | not checked | no, project tags | no | not checked | active |
| Steiger | no | not stated | no, FSD rules only | no | no | beta |
| ArchUnitTS | no, runs in Vitest | not stated | not verified | size counts, custom predicates | none seen | active |
| knip | no | reports unused exported types | no | no | n/a | active |
| Biome / Oxlint | no | Oxlint yes; Biome not stated | not confirmed per folder | size, magic-number, nested-component | not checked | active |

Reading of the table (an inference): dependency-cruiser is the only option that
needs no ESLint, has a documented shrink-only baseline, sees type-only imports
and can match npm packages. It is also what `server/` already uses.

What an import-graph checker cannot see:

- Anything inside a file: inline constants, logic in a component body,
  component length, nested components, hook-rule violations.
- A global `fetch(` call, which is not an import.
- Variable or expression dynamic imports.
- Type-only edges, if `tsPreCompilationDeps` is left at its default.
- Whether a "pure" file is pure; only what it imports.
- A rule whose regex matches no files passes silently (claimed by C-S2, not
  tested).

Size limits are review heuristics, not gates: C21 concedes there is no
objective maximum, C20 found thresholds unreliable, C22 exempts React
components outright.

### Prior art: what to borrow, what is missing

Borrow:

- C11: a short index SKILL.md with a priority table and impact ordering.
- C13: a decision tree, a placement table, MUST / SHOULD / AVOID tiers, a
  linter step, shipped evals. The only set that answers "where does this go".
- C7: a gotchas section fed from real agent mistakes; defaults, not menus.
- C5: evals before the documentation; references one level deep.
- C4: an always-on pointer in `AGENTS.md`, because a skill alone went
  uninvoked in 56% of cases.

Missing everywhere:

- C11 and its sibling skill cover performance and component API design, not
  where constants, helpers or business logic belong.
- C16: official Next.js guidance says nothing on code organisation.
- C15: community rules are flat, unprioritised and unenforced.
- C13 covers placement only in FSD's vocabulary and rejects `helpers.ts`,
  against A2 and C15. There is no consensus to inherit.
- None links a placement rule to the mechanical check that enforces it, or says
  which rules are unenforced.

### Looked for, not found

- Official React-team agent rules (react.dev has only an `llms.txt` index).
- A current, official Shopify frontend structure standard.
- Evidence-based React component size limits (Ferreira and Valente, IST 2023,
  defines a "Large Component" smell; the paper was not fetched).
- Measured tables-versus-prose findings for coding-agent rule files.
- Not verified: whether ArchUnitTS or ts-arch see type-only imports; Biome
  per-folder overrides; `eslint-plugin-project-structure`; the exact
  dependency-cruiser regex for matching `react`; full text of C8, C9, C10, C20.
