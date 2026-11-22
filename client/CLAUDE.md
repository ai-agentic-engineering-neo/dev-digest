# CLAUDE.md — `@devdigest/web`

> **Load this file when** you are working inside `client/` — adding or editing pages, components, TanStack Query hooks, or client-side tests. Skip it when the task is purely in `server/`, `reviewer-core/`, or `e2e/`.
>
> For non-obvious design decisions and known gotchas in this package, read [`insights.md`](./insights.md). For deeper architecture notes or ADRs, check [`docs/`](./docs/). For behavioural specs, check [`specs/`](./specs/).

This file provides guidance to Claude Code when working inside `client/`.

## Package role

Next.js 15 App Router UI. Thin pages, feature logic in colocated `_components/` folders. All data fetching via TanStack Query hooks in `src/lib/hooks/`. No server-side DB access — everything goes through the Fastify API.

## Commands

```sh
pnpm dev          # web on :3000
pnpm test         # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
pnpm build        # production build
```

## Key files

| File | Role |
|------|------|
| `src/lib/api.ts` | All `fetch` calls to the Fastify API; uses `NEXT_PUBLIC_API_BASE` |
| `src/lib/hooks/` | TanStack Query hooks — one file per domain (`reviews.ts`, `agents.ts`, etc.) |
| `src/vendor/shared` | Zod contracts aliased as `@devdigest/shared` — shared with server |
| `src/vendor/ui` | UI primitives aliased as `@devdigest/ui` |
| `src/components/app-shell/` | Nav, breadcrumbs, `g`-then-key keyboard shortcuts |
| `messages/<locale>/` | `next-intl` translation files |

## Route map

```
/                          → redirects to first repo's PR list
/onboarding                → add repository form
/repos/[repoId]/pulls      → PR list
/pulls/[number]            → PR detail: Overview · Files Changed · Agent Runs
/agents                    → agents list
/agents/[id]               → agent editor (model + system prompt + repo-intel toggle)
/settings/[section]        → api-keys · models
```

Pages are thin (`page.tsx` delegates to a `_components/` feature component). Feature logic and tests live together in `_components/<Name>/`.

## Data layer

- `src/lib/api.ts` — raw fetch wrappers, one function per API endpoint
- `src/lib/hooks/core.ts` — shared query client setup
- `src/lib/hooks/reviews.ts` — review runs, findings, SSE trace
- `src/lib/hooks/agents.ts` — agent CRUD
- `src/lib/hooks/repo-intel.ts` — index state polling
- `src/lib/hooks/trace.ts` — SSE run trace streaming

## Testing conventions

Tests are component-level (`*.test.tsx`), colocated with their feature component in `_components/`. `fetch` is mocked globally — tests never hit the real API.

```ts
// Typical test setup
import { render, screen } from '@testing-library/react';
import { QueryClientWrapper } from '@/test/helpers';
```

No integration or browser tests in this package — those live in `e2e/`.

## Non-obvious things

- `NEXT_PUBLIC_API_BASE` defaults to `http://localhost:3001` — must be set if the API runs on a different port.
- Shared Zod contracts are vendored (not a published package): `src/vendor/shared` is kept in sync with `server/src/vendor/shared` via tsconfig path alias.
- UI primitives (`src/vendor/ui`) follow the same vendoring pattern.
- `next-intl` is wired — add new strings to `messages/<locale>/` files, not inline.
