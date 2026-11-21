# client (@devdigest/web) — agent map
Inherits the root `CLAUDE.md`; only client-specific rules here.

## Commands (pnpm)
- `pnpm dev` (:3000) · `pnpm test` (vitest + jsdom, fetch mocked) · `pnpm typecheck`

## Layout
- `src/app/**/page.tsx` — thin routes; feature logic in colocated `_components/<Name>/`
- `src/lib/api.ts` — the only API client; `src/lib/hooks/*` — all data hooks
- `src/components/app-shell/` — nav, breadcrumbs, keyboard shortcuts
- `src/vendor/ui/` — design system (`@devdigest/ui`)
- `src/vendor/shared/` — Zod contracts (`@devdigest/shared`, a separate copy from the server's)
- `messages/<locale>/*.json` — UI strings (next-intl)

## Conventions
- Import UI only from `@devdigest/ui`, never from a layer file inside `vendor/ui`.
- Fetch data only through hooks in `src/lib/hooks/*` — no `fetch` in components.
- No hard-coded colors — components use CSS variables (dark / light via `data-theme`).
- UI text goes into `messages/`, not inline in JSX.
- Each `_components/<Name>/` folder has its own `*.test.tsx`.

## Gotchas
- Adding or changing a `vendor/ui` component → add it to `/showcase`
  (`src/components/showcase/Showcase.tsx`); the smoke test mounts that gallery.

## Read when
- Adding a page or changing the API it calls → read `README.md` §UI route map
- Building or changing a UI component → read `src/vendor/ui/README.md`
- Design question → read `docs/`
- Implementing a feature → read its spec in `specs/`
- Before finishing → check `INSIGHTS.md`; append new lessons
