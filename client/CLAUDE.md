# client — @devdigest/web

Next.js 15 App Router studio (:3000): repos, PR list, review detail, agents, settings. Uses **pnpm**.

## Commands
- `pnpm dev` · `pnpm build` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked (needs no API or browser)

## Map
- `src/app/**/page.tsx` — routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature components, each colocated with its `*.test.tsx`
- `src/components/` — cross-route UI (app-shell, diff-viewer, mermaid-diagram, page-shell)
- `src/lib/api.ts` — the only fetch layer · `src/lib/hooks/*` — TanStack Query hooks per domain
- `messages/en/*.json` — UI strings (next-intl) · `src/i18n/` — i18n setup
- `src/vendor/ui` (`@devdigest/ui`) · `src/vendor/shared` (`@devdigest/shared`) — vendored code

## Conventions (non-default)
- Components get data only through `src/lib/hooks/*` → `src/lib/api.ts`; no direct `fetch` in components.
- New UI component = folder `_components/<Name>/` with the component + its test, next to the route that uses it.
- All user-facing text goes through `next-intl` messages — no hard-coded strings.
- API base URL comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Gotchas
- The contracts in `src/vendor/shared` lag behind the server copy (no `'openrouter'` provider id,
  no `sessionId`). Check `../server/src/vendor/shared` before relying on a type matching the API.

## Do not touch
- `src/vendor/**` — vendored; contract changes start in `../server/src/vendor/shared` and are mirrored here.

## Read when
- Adding a route or a data hook → read `README.md` (UI route map + the API each route uses).
- Calling a new or changed endpoint → read `../server/CLAUDE.md`.
- Writing component tests → read `../TESTING.md`.
- Making an architectural decision → check `docs/` first; record the decision there.
- Implementing a roadmap feature → find its spec in `specs/` (or `../specs/` if cross-module).
- Before starting work here → read `INSIGHTS.md`. When you learn something non-obvious, you MUST record it
  with the `engineering-insights` skill, and check again before finishing the task.
