# `@devdigest/web` — Next.js 15 studio (`:3000`)

## Before answering

**Read the matching document before you touch code.**

| If the task touches… | Read first |
|---|---|
| a route or page | `README.md` — UI route map |
| data fetching, or calling the API | `src/lib/api.ts` and the existing hooks in `src/lib/hooks/` |
| a UI primitive | `src/vendor/ui/README.md` — vendored, do not edit |
| a shape that crosses the API boundary | `src/vendor/shared` — contracts live there, never redeclared locally |
| any test | `../TESTING.md` |
| a whole browser journey rather than one component | `../e2e/CLAUDE.md` |
| a failure that smells familiar | `INSIGHTS.md` — and **append** to it when you hit a new one |

If nothing matches, proceed.

## Commands

`pnpm dev` (`:3000`) · `pnpm test` (vitest + jsdom, `fetch` mocked — no API needed) ·
`pnpm typecheck` · `pnpm build`

## Where things live

| | |
|---|---|
| `src/app/**/page.tsx` | routes (App Router). Pages are thin |
| `src/app/**/_components/<Name>/` | feature logic, colocated with its own `*.test.tsx` |
| `src/components/` | cross-cutting chrome: `app-shell` (nav, breadcrumbs, `g`-then-key shortcuts), `diff-viewer`, `page-shell`, `mermaid-diagram` |
| `src/lib/hooks/` | one hook per API resource — the only data-access layer |
| `src/lib/api.ts` | the single fetch wrapper. `NEXT_PUBLIC_API_BASE`, default `http://localhost:3001` |
| `messages/<locale>/` | `next-intl` strings |
| `src/vendor/ui` `src/vendor/shared` | vendored `@devdigest/ui` and `@devdigest/shared` |

## Conventions

- **Pages stay thin.** Anything with logic moves into `_components/<Name>/` next to it,
  with a test in the same folder.
- **All data goes through `src/lib/hooks/*` → `src/lib/api.ts`.** No `fetch` inside a
  component, no second HTTP client.
- Server state is TanStack Query; do not mirror it into React state.
- User-facing strings go through `next-intl`, never inlined in JSX.
- Types for anything the API returns come from `@devdigest/shared`.

## Gotchas & do not touch

- Tests mock `fetch`, so they pass with the API down. If a change only breaks against a
  real server, it needs an `e2e` flow, not a component test.
- Watch the RSC boundary: a hook or a browser API pulls the file into a client component,
  and `'use client'` cascades to everything it imports.
- **Do not touch** `src/vendor/**` — it is a vendored copy, edits get overwritten.
