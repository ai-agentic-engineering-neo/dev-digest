# frontend-ui-architecture

**Version 1.0.1** · Frontend UI architecture and code organization for React /
Next.js App Router.

| File | Audience | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | agent | The rules |
| [examples.md](examples.md) | agent | Before/after drawn from `client/src` |
| README.md | human | Scope, design decisions, sources, changelog |

## What this skill covers

*Where does this code go* — not *is this code correct*.

- Folder layout and the `shared → features → app` dependency direction
- Thin route files in the App Router
- Colocation, and when to promote code to shared
- Feature boundaries and public APIs
- Placement of components, hooks, constants, helpers, types, config
- Where business logic lives (pure functions / hooks / server-only DAL)
- The `"use client"` boundary as a structural decision
- Naming, imports, barrels
- When to split a component

## What it deliberately does not cover

| Topic | Lives in |
|---|---|
| Purity, derive-don't-store, memoization, effects | [react-best-practices](../react-best-practices/SKILL.md) |
| File conventions, invalid RSC patterns, async APIs, performance | [next-best-practices](../next-best-practices/SKILL.md) |
| Testing patterns | [react-testing-library](../react-testing-library/SKILL.md) |
| Type-level design | [typescript-expert](../typescript-expert/SKILL.md) |

The boundary is deliberate: `react-best-practices` had an 8-line "Code
Organization" section marked MEDIUM, and `next-best-practices` answers "does this
compile and run correctly". Neither answers where a new file belongs.

## Design decisions

Research surfaced nine genuine conflicts between reputable sources. The skill
takes a position on each rather than presenting both sides.

**1. Layer model — bulletproof-react's three tiers, not FSD's seven.**
`shared → features → app`. FSD's `widgets` / `entities` / `processes` are
bureaucracy at this codebase's size (~240 files). Revisit if `features/` passes
roughly 15 domains.

**2. Thin route files — adopted from FSD, without FSD's structure.**
FSD puts page composition in a top-level `src/pages/` layer because its router
has no folder structure of its own. The App Router already provides that
grouping, so the composition component stays colocated as
`_components/<Name>View/`. This repo had already invented the pattern in three of
five routes (`agents`, `settings`, `onboarding`); the skill codifies it and marks
`pulls/*` as the deviation. `client/CLAUDE.md` already asserts "pages stay thin"
— the skill supplies the missing *how* and *why*.

**3. Barrels — boundary only, never aggregation.**
FSD mandates an `index.ts` per slice; TkDodo and Atlassian measured serious build
and bundle costs from barrels. Resolution: a barrel is allowed at a component
folder and at a feature's public API, always with explicit named re-exports.
`export *` is banned outright — `src/lib/hooks/index.ts` is the existing example
of what not to do.

**4. Naming — follow the repo, not bulletproof-react.**
bulletproof-react recommends kebab-case everywhere. This codebase consistently
uses kebab-case for module folders (`app-shell`, `diff-viewer`) and PascalCase
for component folders and files (`AgentCard/AgentCard.tsx`). That is coherent and
already universal here; consistency with existing code beats an external guide.

**5. Constants — no global `constants.ts`.**
The weakest-sourced area in the research; no authority gives a strong rule, and
the one clear warning is that a global constants module becomes a bag of
everything. Position: place by reach — inline, folder, feature, or
`lib/config.ts` for environment values.

**6. Business logic — two homes, keyed on runtime.**
Pure domain rules as plain functions; stateful orchestration in custom hooks
(extraction test from the React docs: if you cannot name it, it is not ready);
server-side reads and authorization in a `server-only` Data Access Layer.

**7. Server state — TkDodo and RSC are not competitors.**
"Keep `useQuery` distributed in the tree" assumes a client-fetching SPA. In an
RSC app the same reads happen in Server Components or the DAL. The skill keys
this on which side of `"use client"` the code sits, so the two never collide.

**8. `app/` holds routing only.**
Next.js is explicitly unopinionated and sanctions three strategies. We adopt the
strictest as *our* convention — it is a team choice, not a framework requirement.

**9. Enforcement — lint and bundler together.**
ESLint import restrictions (`no-restricted-imports`, `import/no-restricted-paths`,
or `eslint-plugin-boundaries`) cover feature boundaries and alias usage;
`server-only` / `client-only` give build-time enforcement of the environment
boundary. A Next.js project should use both.

## Known deviations in this repo

Recorded so the skill is honest about the codebase it ships with. Fix
opportunistically when already editing the area, not as a sweep.

| Location | Deviation |
|---|---|
| `app/repos/[repoId]/pulls/page.tsx` | 135-line route file; `"use client"` at route root |
| `app/repos/[repoId]/pulls/[number]/page.tsx` | same, plus mixed relative/alias imports |
| `.../pulls/[number]/_components/RunTraceDrawer/_components/**` | `_components` nested two levels; 11-segment paths |
| `src/lib/hooks/index.ts` | `export *` aggregation barrel |
| `src/features/` | does not exist yet — created when the first domain is extracted |

## Sources

Collected 2026-07-30. Grouped by weight: the skill's rules trace to Tier 1 and 2;
Tier 4 was used only to confirm the consensus is current.

### Tier 1 — primary / canonical

**[bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)**
The de-facto reference architecture for production React SPAs. Source of the
three-tier layout, the per-feature folder, the unidirectional
`shared → features → app` rule, and the `import/no-restricted-paths` config that
enforces it. → *The Model*, *Layout*, *Feature Boundaries*.

**[bulletproof-react — Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)**
Naming and tooling. Recommends kebab-case filenames via the `check-file` ESLint
plugin, and mandates absolute imports "because it makes it easier to move files
around and avoid messy import paths". → *Imports* (naming overridden, see
decision 4).

**[Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)** ·
**[Layers](https://feature-sliced.design/docs/reference/layers)** ·
**[Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)**
The most formalized frontend architecture methodology. Layers import only from
strictly below; slices are independent and expose a public API; segments group by
technical nature (`ui`, `api`, `model`, `lib`, `config`). Adopted selectively —
see decisions 1 and 2. → *Feature Boundaries*, *Business Logic*.

**[FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide)**
FSD's own reconciliation with the App Router, and the most on-point source for
the thin-route rule: "Use Next.js `app/` for routing only." Route files import
from the pages layer and below, never deep internals. Also: "Server Components
own data reads and composition. Client Components own interactivity and local UI
state. Keep client components 'leaf-like'." → *Thin Route Files*,
*Server/Client Boundary*.

**[Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)**
Framework-authoritative and explicitly unopinionated: "choose a strategy that
works for you and your team and be consistent." Colocation is safe because a
folder is not routable without `page.js`/`route.js`; `_folder` opts a subtree out
of routing; `(group)` organizes without touching the URL. → *Colocation*.

**[Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)**
The authoritative statement of the boundary. `"use client"` declares a boundary
between module graphs, and "all of its imports and the components it directly
renders are included in the client bundle" — transitive downward, hence leaves.
The escape hatch: components passed as `children`/props are not in that graph.
Plus providers as deep as possible, third-party wrapping, and `server-only` /
`client-only`. → *Server/Client Boundary*.

**[Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security)**
Despite the security framing, Vercel's clearest architectural statement on
server-side logic. Three data-fetching architectures, pick one and do not mix;
for new projects a Data Access Layer that runs server-only, authorizes, and
returns DTOs. "Only the Data Access Layer should access `process.env`." Server
Actions stay thin and re-check auth, because a page-level check does not extend
to them. → *Business Logic*, *Server-side data access*.

**[React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)**
The official extraction heuristic: if you cannot pick a clear name for the hook,
it is not ready to be extracted. → *Business Logic*.

**[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)**
The principle behind feature folders: place code as close to where it is relevant
as possible; things that change together live together. Stated exception —
e2e tests belong at the project root. → *Colocation*.

### Tier 2 — strong supporting opinion

**[Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/)**
The best "grow into it" progression: single file → component folders → technical
folders → feature folders → domains → packages. Only *reusable* hooks go in
shared `hooks/`; single-use hooks stay with their component. → *Promote on the
second consumer*.

**[React Handbook — Project Structure](https://reacthandbook.dev/project-structure)**
Derived from bulletproof-react, adds pragmatism worth keeping: do not spend more
than five minutes planning structure, organize as you go, split a folder once it
holds ~10+ files. → *Anti-over-engineering*.

**[TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)**
Circular imports and eager loading of all re-exports. Measured: a Next.js project
went from 11,000+ modules to ~3,500 (−68%) by deleting internal barrels. Barrels
are for library entry points, not directory grouping. → decision 3.

**[Atlassian — 75% Faster Builds by Removing Barrel Files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)**
Independent large-scale confirmation with build numbers. → decision 3.

**[TkDodo — React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager)** ·
**[Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state)**
Server state is not owned by the frontend. Do not copy it into local state or
Context to avoid prop drilling; tune `staleTime` instead of syncing. → decision 7.

**[Dmitri Pavlutin — 7 Architectural Attributes of a Reliable React Component](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/)**
The most rigorous treatment of when to split: build a component around one
distinguishable **axis of change**. Better than any line count. → *When to Split*.

**[Robert C. Martin — Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)**
The rationale for feature folders: architecture should scream the domain, not the
framework. → *The Model*.

**[Vercel Academy — Client-Server Component Boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries)**
Teaching companion to the official docs; the decision procedure for pushing the
boundary to leaves. → *Server/Client Boundary*.

### Tier 3 — enforcement and tooling

- **[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)** ([npm](https://www.npmjs.com/package/eslint-plugin-boundaries)) — declare element types and allowed dependencies; analyzes `import`, `require`, dynamic `import()`, extensible to other AST nodes.
- **[Nx — Enforce Module Boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)** — tag-based enforcement, relevant only if this becomes a real monorepo.
- **[server-only](https://www.npmjs.com/package/server-only)** / **[client-only](https://www.npmjs.com/package/client-only)** — build-time environment boundary.
- **[Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)** — if `route.ts` is ever used as an architectural layer.

### Tier 4 — secondary, for framing only

Individual blog posts, used to verify the Tier 1–2 consensus is current. Not cited
as authority.

- [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)
- [Codemzy — My React file/folder structure, 2025 changes](https://www.codemzy.com/blog/react-file-structure)
- [Infinum Frontend Handbook — React project structure](https://infinum.com/handbook/frontend/react/project-structure)
- [Web Dev Simplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [Profy.dev — Path To A Clean(er) React Architecture: Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Reboot Studio — 4 folder structures to organize your React project](https://reboot.studio/blog/folder-structures-to-organize-react-project)
- [Matias Kinnunen — Locality of Behavior / Co-location](https://mtsknn.fi/blog/locality-of-behavior-and-co-location/)
- [jsdev.space — How to Replace Barrel Files with Better Import Strategies](https://jsdev.space/howto/stop-using-barrel-files/)
- [Dharmsy — Next.js 16 App Router Folder Structure](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure) — "In the App Router, folders are not just organization … The structure *is* the architecture."
- [Raghuveer — Next.js Server vs Client Components: Drawing the Right Boundary](https://www.iamraghuveer.com/posts/nextjs-server-vs-client-components/)
- [Groovy Web — Next.js Folder Structure for full-stack](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)

## Frontmatter

| Key | Purpose |
|---|---|
| `name` | skill id, must match the folder |
| `description` | *what* the skill is — its scope |
| `when_to_use` | *when* to fire, including negative triggers |
| `version` | bump with the changelog below |

`when_to_use` is not decoration: Claude Code concatenates it onto `description`
with `" - "` in the skill listing the model sees, so it is live trigger text.
Verified against `engineering-insights`, the only other skill here that sets it —
and the only one whose listing carries that suffix.

Split them by role. `description` says what the skill covers; `when_to_use`
lists the moments that should fire it, and the moments that should fire a
neighbouring skill instead. The negative half matters most here — without it,
component-behaviour questions get routed to this skill rather than to
[react-best-practices](../react-best-practices/SKILL.md).

## Changelog

### 1.0.1 — 2026-08-02

Split trigger conditions out of `description` into `when_to_use`, and added
negative triggers pointing behaviour questions at `react-best-practices` and
Next.js mechanics at `next-best-practices`. No rule changes.

### 1.0.0 — 2026-08-02

Initial release. Model: bulletproof-react three tiers + thin route files.
Sections: layout, thin routes, colocation, feature boundaries, placement table,
constants, business logic, server/client boundary, naming, imports, when to
split, anti-patterns, migration order. Nine design decisions recorded above;
examples drawn from `client/src`.

## Maintenance

Bump the `version` in [SKILL.md](SKILL.md) frontmatter and add a changelog entry
when rules change. Revisit if: `features/` passes ~15 domains (reconsider decision
1), the project gains a real monorepo (Tier 3 tooling), or Next.js changes the
`"use client"` semantics this depends on.
