# client — @devdigest/web (Next.js 15)

The studio UI: import repos, browse PRs, run/read AI reviews, author agents.
Full route map + API surface → [README.md](README.md).

## Stack

Next.js 15 (App Router), React 19, TanStack Query, `next-intl`, Tailwind,
Zod, `recharts`, `mermaid`, `react-markdown`.

## Commands

`pnpm dev` (:3000) · `pnpm build` · `pnpm typecheck` · `pnpm test` (vitest + jsdom, `fetch` mocked — no API needed)

## Map

- `src/app/` — routes: `repos`, `agents`, `onboarding`, `settings`
- `src/components/app-shell/` — cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts)
- `src/lib/api.ts` + `src/lib/hooks/*` — every API call goes through here
- `src/i18n/` + `messages/en/` — next-intl translations
- `src/vendor/ui/` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`) — vendored, don't patch in place

Feature logic sits in colocated `_components/<Name>/` folders next to each page, each with its own `*.test.tsx`.

## References

- [docs/](docs/) — deeper notes that don't fit the README
- [specs/](specs/) — feature specs for this module
- [insights.md](insights.md) — gotchas discovered while working here; check before deep-diving. New findings get appended here by the `engineering-insights` skill

## Gotchas

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) is the only place the API origin is configured — see `src/lib/api.ts`
- Component tests never hit a real API or browser; real user journeys are covered by [`../e2e`](../e2e/CLAUDE.md) instead
