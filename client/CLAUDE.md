# client — Next.js studio UI (talks to the API on :3001)

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query 5 · Tailwind 4 · next-intl 3 · Zod 3 · pnpm

## Commands
- `pnpm dev` (`:3000`) · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked, no API needed

## Map
- `src/app/**` — routes; page-local UI in `_components/<Name>/`, tests next to it
- `src/lib/hooks/` — all API access (React Query)
- `src/components/` — app-wide components
- `src/vendor/ui/` (`@devdigest/ui`) — design-system kit
- `src/vendor/shared/` (`@devdigest/shared`) — Zod contracts (copy of the server's)
- `messages/en/` — UI strings (next-intl)

## Conventions
- Types/contracts come from `@devdigest/shared` (via `src/lib/types.ts`) — never hand-duplicate them.
- Data access only through hooks in `src/lib/hooks`; no raw `fetch` in components.
- UI strings go into `messages/en/<area>.json`, not inline.
- Use `@devdigest/ui` before writing new base components.

## Gotchas
- `src/vendor/shared` is not synced with `server/src/vendor/shared`; contract changes go in both.

## Docs — read when relevant
- UI route map → API endpoints each page uses → `client/README.md`
- Index of deeper docs (incl. UI kit) → `client/docs/README.md`
- Before implementing a feature → `client/specs/README.md`, then the feature spec; no spec → ask
- Before debugging or a non-trivial change → `client/INSIGHTS.md`
- Found something non-obvious → append to `client/INSIGHTS.md`, not here
