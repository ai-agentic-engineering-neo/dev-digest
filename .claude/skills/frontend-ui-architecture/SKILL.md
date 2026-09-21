---
name: frontend-ui-architecture
description: "React + Next.js frontend architecture and code organization guide — where components, constants, utils/helpers, and business logic should live, how to split components, feature-based folder structure, colocation, and module boundaries. Use whenever deciding WHERE a new component, hook, constant, util, or business-logic function should go, when designing or reviewing a feature folder, or when a component/file is growing and needs to be split. This is about project structure and separation of concerns, not component internals, hooks correctness, or performance — for those use react-best-practices; for Next.js file conventions (routing, RSC, metadata) use next-best-practices."
version: "1.0.0"
---

# Frontend UI Architecture

Guidance for **where code lives**, not how it's written. Covers React +
Next.js project structure, component splitting, and the placement of
constants, utils/helpers, and business logic.

- [README.md](README.md) — what this skill is, when it fires, and every
  source it's built on.
- [folder-structure.md](folder-structure.md) — top-level project layout,
  the decision order for where a new file goes, and folder-level
  anti-patterns (barrels, cross-feature imports, premature global folders).
- [component-organization.md](component-organization.md) — when to split a
  component, where business logic lives (pure function vs. hook), and the
  constants/utils/helpers naming convention.
- [nextjs-organization.md](nextjs-organization.md) — route-local UI via
  private folders in the App Router, and how it interacts with the
  feature-based layout.

## Relationship to sibling skills

- **react-best-practices** — component internals, hooks correctness,
  state/memoization anti-patterns. Read that for *how* a component or hook
  is written.
- **next-best-practices** — Next.js-specific file conventions (routing, RSC
  boundaries, metadata, async APIs). Read that for framework mechanics.
- **onion-architecture** — the backend counterpart: dependency direction for
  `server/` and `reviewer-core/`. Read that for anything about where
  backend code lives.
- **This skill** — *where* a file belongs and *when* to split it. If a
  question is "should this be a hook or a component," go to
  react-best-practices; if it's "which folder should this file live in,"
  stay here.

## Core Principle: Colocation Over Categorization

Default to organizing by **feature/domain**, not by technical type. Things
that change together should live together (Kent C. Dodds, paraphrasing Dan
Abramov). A folder structure of `components/`, `hooks/`, `utils/`,
`services/` at the project root forces every change to touch multiple
folders and tells a new developer nothing about what the app does. See
[folder-structure.md](folder-structure.md) for the full layout this
principle produces.

## Where Does New Code Belong? (quick routing)

1. **A new component, feature file, or top-level folder decision** →
   [folder-structure.md](folder-structure.md).
2. **Splitting a growing component, or deciding hook vs. plain function vs.
   constant** → [component-organization.md](component-organization.md).
3. **Anything inside `app/` in the Next.js App Router** →
   [nextjs-organization.md](nextjs-organization.md), then fall back to
   [folder-structure.md](folder-structure.md) for the shared-layer rules.

Each linked file ends with its own review checklist — use those directly
when reviewing a PR rather than re-deriving the rules here.
