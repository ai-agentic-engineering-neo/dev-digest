# client/ — @devdigest/web

Next.js 15 (App Router) + React 19 + TanStack Query + next-intl. The studio UI.
Port 3000. All data flows `src/lib/hooks/*` → `src/lib/api.ts` → Fastify API
(`NEXT_PUBLIC_API_BASE`).

## Commands

| Task | Command |
|------|---------|
| dev | `pnpm dev` |
| test | `pnpm test` (vitest + jsdom, fetch mocked — no API needed) |
| typecheck | `pnpm typecheck` |

## Where things lie

- `src/app/**/page.tsx` — routes; pages are thin.
- `src/app/**/_components/<Name>/` — feature components, colocated with their
  `*.test.tsx`.
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts.
- `src/lib/api.ts` + `src/lib/hooks/*` — the single API client and every data hook.
- `messages/<locale>/*.json` — next-intl UI copy.
- `src/vendor/ui`, `src/vendor/shared` — vendored primitives and Zod contracts.

## Hard rules

- Keep pages thin — feature logic goes into colocated `_components/<Name>/`.
- Component tests always run with fetch mocked; they never hit the real API.
- User-visible copy goes through next-intl (`messages/<locale>/*.json`), not
  inline strings.
- Don't edit `src/vendor/` casually — it's vendored; contract changes must be
  mirrored into `server/src/vendor/shared`.

## Read when …

- Adding a screen or hook → read [`README.md`](README.md) (UI route map, which
  API endpoints each route leans on).
- Working here → read [`INSIGHTS.md`](INSIGHTS.md) first — always before a
  task, especially when debugging something non-obvious; at the end of a
  substantial session, capture learnings per the engineering-insights skill.
- Changing behavior covered by a decision → check [`specs/`](specs/) and update
  the spec in the same PR; how-tos live in [`docs/`](docs/README.md).
