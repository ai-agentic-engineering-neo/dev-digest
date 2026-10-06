# client — @devdigest/web

Next.js 15 (App Router) + React 19 + TanStack Query 5 + Tailwind 4 + next-intl 3, port 3000. Package manager: **pnpm**.

## Docs — read when relevant
- [README.md](README.md) — UI route map and which API endpoints each page uses.
- [docs/](docs/) — deeper UI/architecture notes.
- [specs/](specs/) — feature specs. **Find the spec before implementing a feature.**
- [../TESTING.md](../TESTING.md) — test philosophy.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (vitest + jsdom, fetch mocked — no API needed)

## Where things live
- `src/app/**/page.tsx` — routes; pages are thin
- `src/app/**/_components/<Name>/` — feature components, each with a colocated `*.test.tsx`
- `src/lib/api.ts` — the only HTTP client · `src/lib/hooks/*` — every data hook (TanStack Query)
- `src/components/app-shell` — nav, breadcrumbs, keyboard shortcuts
- `messages/<locale>/*.json` — i18n strings · `src/vendor/ui` — UI primitives (`@devdigest/ui`)

## Conventions
- Data access only through hooks in `src/lib/hooks` → `src/lib/api.ts`; no raw `fetch` in components.
- All user-visible text goes through `next-intl` messages, not hardcoded strings.
- New component → colocated test (React Testing Library, query by role/text).

## Gotchas
- `src/vendor/shared` is a **copy** of `server/src/vendor/shared` (canonical) and has drifted.
  Contract change → update both.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Insights
@INSIGHTS.md
