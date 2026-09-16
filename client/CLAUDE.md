# `@devdigest/web` — the studio (Next.js 15)

## Stack

Next.js 15.1 (App Router) · React 19 · TanStack Query 5 · `next-intl` (messages
in `messages/<locale>/*.json`) · `recharts` · `mermaid` · `react-markdown` ·
Zod 3.24 · Tailwind 4 · TypeScript. UI primitives vendored under `src/vendor/ui`
(`@devdigest/ui`), shared Zod contracts under `src/vendor/shared`
(`@devdigest/shared`). Test: vitest 2 + jsdom + Testing Library.

## Commands

`pnpm dev` (:3000) · `pnpm build` · `pnpm test` (vitest + jsdom, fetch mocked) · `pnpm typecheck`.

## Read when

- `README.md` — UI route map, API surface per route.
- `../TESTING.md` — this module's suite (`client.yml`) and what it does/doesn't cover.
- `docs/` — design notes/ADRs for this module.
- `specs/` — feature/behavior specs for this module.
- `INSIGHTS.md` — accumulated gotchas/decisions for this module.

## Naming conventions

- Components are self-contained PascalCase folders: `Name/Name.tsx` (+ colocated `Name/Name.test.tsx` when tested).
- Subcomponents nest one level under their parent in a `_components/` folder (e.g. `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`) — the leading underscore is the Next.js "never routable" convention, don't drop it.
- Data hooks are camelCase in `src/lib/hooks/*` (e.g. `useRepos`), one hook file per resource.

## Gotchas

- `src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`) are vendored — don't hand-edit; changes belong upstream.
- Every data hook lives in `src/lib/hooks/*` → `src/lib/api.ts`; don't `fetch` directly in components.
- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Do not touch

- `src/vendor/ui`, `src/vendor/shared` — see Gotchas above.
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.
