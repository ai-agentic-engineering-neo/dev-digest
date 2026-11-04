# client/ — `@devdigest/web` (Next.js 15 App Router, React 19)

## Before answering

Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Commands (pnpm, run in `client/`)

- `pnpm dev` (`:3000`) · `pnpm test` (vitest + jsdom, fetch mocked) · `pnpm typecheck` · `pnpm build`
- API base: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Layout

- `src/app/**/page.tsx` — thin pages; feature UI in colocated `_components/<Name>/`.
- `src/lib/api.ts` — the only fetch wrapper (`apiFetch`, normalizes errors to `ApiError`).
- `src/lib/hooks/*` — every server call is a TanStack Query hook here.
- `src/components/` — app-level shared pieces (app-shell, diff-viewer, page-shell).
- `src/vendor/ui` (`@devdigest/ui`) — design system; `src/vendor/shared` (`@devdigest/shared`) — Zod contracts.
- `messages/en/*.json` — next-intl strings (files for future lessons already exist).

## Conventions

- Component folder shape: `Name.tsx`, `index.ts` (re-export), `styles.ts`, `constants.ts`, `helpers.ts`,
  `Name.test.tsx`. Follow it for new components.
- Data: no `fetch` in components — add/extend a hook in `src/lib/hooks/*` that calls `api.*`.
- UI: import only from the `@devdigest/ui` barrel, never deep paths. Styles are inline objects keyed off
  CSS variables (`var(--accent)`); no hard-coded colors. New/changed UI component → add to `/showcase`
  (`src/components/showcase/Showcase.tsx`), the smoke test mounts it.
- Severity/category visuals via `SeverityBadge` / `CategoryTag`, not raw `SEV`/`CAT` maps.
- User-visible text goes through next-intl messages, not literals.
- Types come from `@devdigest/shared` (re-exported in `src/lib/types.ts`); don't redefine contracts.

## Gotchas

- `src/vendor/shared` is a COPY of `server/src/vendor/shared` and has drifted (e.g. `LLMProvider.id`
  lacks `'openrouter'`). If a type looks missing, compare with the server copy and ask before editing either.
- Live run progress: SSE `EventSource(/runs/:id/events)` in `hooks/reviews.ts`, plus polling refetch
  (reviews 4s while active, index-state 1.5s). Don't add a third mechanism.

## Do not touch

- `src/vendor/ui/primitives/tokens.ts` semantics and `styles.css` variable names without updating all usages.

## Read when

- Adding a route/screen → read `README.md` (UI route map).
- Building or changing UI components → read `src/vendor/ui/README.md`.
- Deep-dives → read `docs/` · UI/flow specs → read `specs/` · findings → read `INSIGHTS.md`.
