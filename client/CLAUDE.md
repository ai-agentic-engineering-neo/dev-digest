# client — `@devdigest/web` (Next.js 15 studio)

## Commands (run in `client/`)
- `pnpm dev` (:3000) · `pnpm typecheck` · `pnpm test` (vitest + jsdom, fetch mocked)

## Layout
- `src/app/**` — App Router pages; pages stay thin
- `src/app/**/_components/<Name>/` — feature components, each with a colocated `*.test.tsx`
- `src/lib/api.ts` — the only `fetch` wrapper; `src/lib/hooks/*` — TanStack Query hooks
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui/` (`@devdigest/ui`) — UI primitives · `src/vendor/shared/` — contracts COPY
- `messages/en/*.json` — next-intl strings, one file per feature area

## Conventions
- Data access only through a hook in `src/lib/hooks/*` → `api.ts`; no ad-hoc fetch in components.
- User-visible text goes through next-intl (`useTranslations`) + `messages/en/*.json`;
  no hardcoded strings.
- Reuse primitives from `@devdigest/ui` before adding new ones.
- Changing a contract in `src/vendor/shared` means changing `server/src/vendor/shared` too.
- Component tests: React Testing Library, query by role/text, mock `fetch`.

## Gotchas
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- The full browser journey is tested in `../e2e`, not here — keep these tests hermetic.

## Read when relevant
README.md (route map → API calls) · docs/ · INSIGHTS.md · ../specs/
