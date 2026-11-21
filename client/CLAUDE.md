# client — @devdigest/web

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Tailwind 4 · Vitest 2 + jsdom
UI route map and testing: [README.md](README.md) · root rules: [../CLAUDE.md](../CLAUDE.md)

## Commands
- `pnpm dev` (:3000) · `pnpm typecheck` · `pnpm test` (fetch mocked, no API needed)
- API base: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`)

## Map
- `src/app/**/page.tsx` — thin pages; feature logic in colocated `_components/<Name>/` with `*.test.tsx`
- `src/lib/api.ts` + `src/lib/hooks/*` — every data hook lives here
- `messages/<locale>/*.json` — all user-facing strings (next-intl)
- `src/vendor/ui` (`@devdigest/ui`) — design system: [README](src/vendor/ui/README.md)
- `src/vendor/shared` (`@devdigest/shared`) — Zod contracts

## Conventions
- Import UI only from `@devdigest/ui`, never from a layer file inside it.
- No hardcoded UI strings: add them to `messages/`.
- Data fetching goes through `src/lib/hooks/*`, not inline `fetch` in components.

## Gotchas
- `src/vendor/shared` is a separate copy of server's contracts and has drifted. Mirror contract changes.
- Real browser journeys are covered by [../e2e](../e2e/CLAUDE.md), not by unit tests here.

## Docs (linked, open when relevant)
[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
