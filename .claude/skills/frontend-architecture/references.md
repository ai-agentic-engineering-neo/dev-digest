# Frontend Architecture — Sources & Rationale

Research brief for the (not-yet-authored) `frontend-architecture` skill. Every
source below was fetched and read this session — none are cited from memory.
Six primary sources, covering the seven target topics. Where sources take
different stances, that's called out explicitly rather than silently resolved.

## 1. Directory / folder structure

- **[bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)**
  The most widely-cited open-source React architecture reference. Argues for a
  `features/` folder where each feature owns its own `api`, `components`,
  `hooks`, `stores`, `types`, `utils` subfolders, plus a strict, ESLint-enforced
  unidirectional import rule: **shared → features → app**. Cross-feature
  imports are disallowed by tooling, not just convention — composition happens
  at the app layer instead.
- **[Next.js — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure)**
  Official docs. Explicitly **unopinionated**: presents three equally valid
  strategies (project files outside `app`; project files in top-level folders
  inside `app`; files split by feature/route alongside route segments) and
  says to "choose a strategy that works for you and your team and be
  consistent." Backs topic 7 as well.
- **[Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/)**
  A progressive, five-stage model (single file → multiple files → component
  folders → technical folders → feature folders), explicitly framed as a
  *structural guideline, not a naming convention*. Useful as a "how to grow
  into" companion to bulletproof-react's "already at scale" end state.
- **[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)**
  The philosophical root of feature-folder thinking: "Place code as close to
  where it's relevant as possible." Applies the same argument uniformly to
  comments, styles, tests, state, and utilities — code should live near its
  usage until reuse across multiple places justifies extraction.

**Note on disagreement:** bulletproof-react enforces its structure with
ESLint import-boundary rules — a hard constraint. Kent C. Dodds's colocation
principle ("colocate until it hurts, then abstract") is a judgment-call
heuristic with no enforcement mechanism. Both agree on the *direction*
(colocate by feature, extract to shared only when reused), but disagree on
whether that direction should be tooling-enforced or left to developer
discretion.

## 2. Component decomposition

- **[react.dev — Thinking in React](https://react.dev/learn/thinking-in-react)**
  Official React docs. Step 1 of the canonical five-step process: break the
  UI into a component hierarchy by drawing a box around every component/
  subcomponent, then align that breakdown with the shape of the underlying
  data model. Core rule: "a component should ideally only do one thing" —
  if it grows, decompose it further.
- **Robin Wieruch — React Folder Structure Best Practices** (see above)
  Adds a concrete extraction trigger react.dev doesn't specify: split a
  component into its own file/module **once it becomes reusable elsewhere**;
  a subcomponent that's tightly coupled to one parent and used nowhere else
  (his example: `ListItem` inside `List`) is better left inline in the same
  file rather than split prematurely.

## 3. Constants placement

- **Robin Wieruch — React Folder Structure Best Practices** (see above)
  The only source of the six with a direct, explicit stance: feature-specific
  constants live in a `constants.ts` colocated inside that component's/
  feature's own folder; constants get promoted to a shared location only once
  more than one feature needs them — the same colocate-then-promote rule
  applied to utils.
- **Kent C. Dodds — Colocation** (see above) supplies the general principle
  this specific case follows, but does not call out constants by name.

**Gap noted:** bulletproof-react's project-structure doc does not address
constants placement explicitly at all — it's silent on this specific
question despite covering `api`, `components`, `hooks`, `stores`, `types`,
`utils`. Worth flagging when the skill is written: this is the topic with the
thinnest direct sourcing and may need a supplementary source pass.

## 4. Utils / helpers organization

- **bulletproof-react — Project Structure** (see above)
  Root-level `utils/` for utilities shared across features;
  `src/features/[feature]/utils` for feature-specific ones. Same
  shared-vs-local split as the rest of its architecture.
- **Robin Wieruch — React Folder Structure Best Practices** (see above)
  Matches bulletproof-react's rule almost exactly: "if a util is tightly
  coupled to a feature, move it to that feature folder" — promote to the
  shared `utils/` only when multiple features need it.
- **Kent C. Dodds — Colocation** (see above)
  Provides the underlying rationale for both: don't extract a helper to a
  central `utils` directory prematurely — keep it near its first usage site
  until a second consumer actually justifies the move.

All three sources agree here without meaningful disagreement — this is the
most consistently-corroborated topic of the seven.

## 5. Business logic placement

- **bulletproof-react — Project Structure** (see above)
  Data-access/business logic lives in each feature's `api/` subfolder
  ("exported API request declarations and api hooks related to a specific
  feature"), keeping fetch/mutation logic out of components. A root-level
  `api` folder is offered as an alternative when API calls are shared across
  features.
- **Robin Wieruch — React Folder Structure Best Practices** (see above)
  Frames the same idea through hooks rather than an api layer: reusable
  logic goes in a shared `hooks/` folder; feature-specific hooks stay inside
  the feature folder. Also warns against calling third-party APIs directly
  inside components — wrap them so the call site stays swappable.

## 6. State management architecture

- **[bulletproof-react — State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md)**
  Categorizes state into five kinds — component, application (global UI
  concerns like modals), server cache, form, and URL state — and argues each
  category should be handled by the tool built for it (React Query/SWR for
  server cache, React Hook Form/Formik for forms, URL params for
  filters/pagination, Context/Redux/Zustand/Jotai/XState only for genuine
  cross-cutting application state). Explicit principle: "localize state as
  closely as possible to the components that require it" before reaching for
  anything global.
- **[Redux Style Guide](https://redux.js.org/style-guide/)**
  Official Redux docs. Recommends the "ducks" pattern: one slice file per
  feature folder (e.g. `features/todos/todosSlice.ts`) built with Redux
  Toolkit's `createSlice`, replacing the older folder-by-type
  (`actions/`, `reducers/`) split. Keeps state logic co-located by feature,
  consistent with topic 1's overall pattern.

**Note on disagreement/scope difference:** the Redux Style Guide is
necessarily Redux-centric — it optimizes *how* to structure state once
Redux is the chosen tool. bulletproof-react's state-management doc argues a
step earlier: most state shouldn't go through a global store like Redux at
all, since server-cache, form, and URL state each have purpose-built tools
that outperform a general state manager for that job. The two aren't
contradictory, but a skill drawing on both should be explicit that Redux's
feature-folder/slice pattern applies specifically to the "application state"
slice of bulletproof-react's taxonomy, not to state generally.

## 7. Next.js-specific structure

- **Next.js — Project Structure and Organization** (see above)
  Canonical source. Key conventions: **colocation is safe by default** inside
  `app/` (only `page.js`/`route.js` make a segment publicly routable, so
  sibling files are never accidentally exposed); **private folders**
  (`_folderName`) opt a folder and its subtree out of routing entirely —
  useful for per-route `_components/` and `_lib/` folders; **route groups**
  (`(folderName)`) organize routes without affecting the URL, enabling
  per-section layouts. Explicitly presents "split by feature or route" as one
  of three equally-supported top-level strategies — this is the strategy this
  repo's own `client/` package already follows (`_components/<Name>/` per
  route, per `client/CLAUDE.md`), which is useful validation that the
  project's existing convention matches an officially-documented pattern
  rather than being a one-off.

---

## Follow-ups for whoever authors SKILL.md
- Constants placement (topic 3) has only one direct source — consider a
  second pass specifically for constants/config conventions (e.g. a
  TypeScript-focused style guide) before writing that section.
- Consider fetching one more state-management source that isn't Redux-specific
  (e.g. Zustand's own recommended-patterns docs) if the skill needs to speak
  to non-Redux projects without leaning solely on bulletproof-react's framing.
- `project-standards.md` in bulletproof-react (kebab-case naming, absolute
  imports via `@/*`) was reviewed but not cited above as a primary source —
  it's tooling/naming hygiene, not architecture, so it's a candidate for the
  skill's `examples.md` rather than `references.md`.
