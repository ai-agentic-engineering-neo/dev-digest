# Frontend architecture — sources

The research behind the frontend code-organisation skill for `client/`. Kept as
a reusable catalogue: every entry has the exact URL, what it supports, one
verbatim quote and its limits.

## How this list was built

- Collected 2026-11-26. Every page was fetched that day; nothing is cited from
  memory.
- Quotes are verbatim and were matched against the fetched page text. A second
  pass re-checked 21 quotes from part A against the pages; all matched.
- "Summary only" marks a detail that rests on a fetch tool's summary rather
  than on text read verbatim. Do not quote those.
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
