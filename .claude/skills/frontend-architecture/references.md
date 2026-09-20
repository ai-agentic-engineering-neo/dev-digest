# Frontend Architecture Skill — References and Sources

All sources consulted while building this skill (`SKILL.md` /
`examples.md`), organized by category. `frontend-architecture` covers only
organization/placement decisions — sources on component-internals
anti-patterns or Next.js API mechanics are cataloged in
`react-best-practices/references.md` / `next-best-practices` instead, not
duplicated here.

---

## Official Documentation

### React
- **Thinking in React**: https://react.dev/learn/thinking-in-react
  — breaking a UI into a component hierarchy; source for "Component
  Placement" and "Component Splitting" framing.
- **Reusing Logic with Custom Hooks**: https://react.dev/learn/reusing-logic-with-custom-hooks
  — when stateful/effectful logic should move out of a component into a
  hook; source for "Utils, Helpers & Hooks".
- **You Might Not Need an Effect**: https://react.dev/learn/you-might-not-need-an-effect
  — extracting fetching/event logic into custom hooks or plain functions;
  source for the hook-vs-helper boundary.

### Next.js
- **Getting Started: Project Structure**: https://nextjs.org/docs/app/getting-started/project-structure
  — App Router folder/file conventions, private folders (`_folder`),
  colocation safety; primary source for "Next.js Route Architecture".
- **Routing: Project Organization (colocation)**: https://nextjs.org/docs/14/app/building-your-application/routing/colocation
  — colocation is safe by default in `app/`; only `page.js`/`route.js`
  make a segment public. (Versioned doc; the current App Router still
  follows this behavior per the Project Structure page above.)

---

## Established Architecture Methodologies

### Bulletproof React
- **Repository**: https://github.com/alan2207/bulletproof-react
- **Project structure doc**: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Feature-based architecture: group by business feature, not technical
  role; `features/` for feature modules, `components/`/`hooks/`/`lib/`
  reserved for genuinely shared code. Direct source for the
  "promote only on a second real consumer" rule.

### Feature-Sliced Design (FSD)
- **Official site**: https://feature-sliced.design
- **Documentation repository**: https://github.com/feature-sliced/documentation
- Layered architecture with strict one-way dependency rules between
  layers, and "slices" per business feature within a layer. Source for
  the "Layering Overview" one-way-dependency framing (adapted to this
  repo's simpler 4-layer version rather than FSD's full layer set).

### Atomic Design (Brad Frost)
- **Original post**: https://bradfrost.com/blog/post/atomic-web-design/
- **Book / methodology chapter**: https://atomicdesign.bradfrost.com/chapter-2/
- Atoms → molecules → organisms → templates → pages hierarchy. Used as a
  lens for component-hierarchy thinking, not adopted as literal folder
  naming (this repo's convention is feature-colocation, not atomic
  layers).

---

## Practitioner Articles

### Kent C. Dodds
- **State Colocation will make your React app faster**: https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
  — keep state (and by extension, the code that owns it) as close as
  possible to where it's used; source for the promotion-bar rules
  throughout (components, constants, helpers).
- **Application State Management with React**: https://kentcdodds.com/blog/application-state-management-with-react
  — layering state/logic by how widely it's needed rather than defaulting
  to global stores.

### Josh W. Comeau
- **Delightful React File/Directory Structure**: https://www.joshwcomeau.com/react/file-structure/
  — component-folder pattern (component + barrel `index.ts` +
  colocated concerns); source for the file→folder splitting triggers in
  "Component Splitting".

### Robin Wieruch
- **React Folder Structure Best Practices**: https://www.robinwieruch.de/react-folder-structure/
  — the file → files → folders → technical folders → feature folders
  progression; source for treating folder-splitting as a response to
  concrete growth signals, not a fixed template. Also informs "Growth &
  Refactoring Triggers".

### patterns.dev
- **Container/Presentational Pattern**: https://www.patterns.dev/react/presentational-container-pattern/
  — separating data/fetching concerns from rendering; source for the
  "Business Logic Placement" data-fetching boundary (hooks own fetching,
  components own presentation), reframed here as a placement rule rather
  than a component-authoring pattern (which `react-best-practices` already
  covers).

---

## Style Guides

### Airbnb React/JSX Style Guide
- **Repository**: https://github.com/airbnb/javascript/tree/master/react
- One component per file, directory-name-as-component-name convention;
  cross-checked against this repo's existing per-component folder
  convention (`Name/Name.tsx` + `index.ts`) — consistent with it.

---

## This Repository's Existing Conventions (grounding, not external sources)

- `client/CLAUDE.md` — canonical rule that feature logic is colocated in
  `_components/<Name>/` per route, `src/components/` is reserved for
  cross-cutting chrome, and all server calls go through
  `src/lib/hooks/*` + `src/lib/api.ts`. This skill formalizes and
  generalizes what this file already mandates for `client/`.
- `client/src/app/**/_components/**` (actual layout) — verified every
  component folder already follows `Name.tsx` / `constants.ts` /
  `helpers.ts` / `index.ts`, confirming the rules in `SKILL.md` describe
  real, not aspirational, practice.
- `client/INSIGHTS.md` — prior dated entries on single-ownership of
  filter state and the overlay/portal pattern; consistent with (not
  duplicated into) the "Growth & Refactoring Triggers" section here.

---

*Last updated: 2026-09-19.*
