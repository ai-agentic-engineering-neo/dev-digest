# client/ — `@devdigest/web` (Next.js 15 App Router)

Module guide. Root map: [../CLAUDE.md](../CLAUDE.md).

## Read when

- Any client task → first read [INSIGHTS.md](INSIGHTS.md) (agent-written lessons).
- UI route map and testing notes → [README.md](README.md)
- UI primitives (`Badge`, `Icon`, `CircularScore`, …) → [src/vendor/ui/README.md](src/vendor/ui/README.md)
- Deeper design notes → [docs/](docs/) · feature specs and plans → [specs/](specs/)

## Layout

```
src/app/                         Next.js routes; feature components in `_components/<Name>/`
  repos/[repoId]/pulls/          PR list (PRRow, FilterBar; GRID + COLUMN_KEYS in constants.ts)
  repos/[repoId]/pulls/[number]/ PR detail: FindingsTab, ReviewRunAccordion, RunHistory, RunTraceDrawer, …
src/components/                  app-wide components (app-shell, run-cost-badge, …)
src/lib/api.ts                   apiFetch → http://localhost:3001
src/lib/hooks/*.ts               TanStack Query hooks (core.ts = repos/pulls, reviews.ts, trace.ts)
src/lib/types.ts                 re-exports contract types from @devdigest/shared
src/vendor/shared, vendor/ui     contracts (client copy), UI primitives (@devdigest/ui)
messages/en/*.json               next-intl strings (prReview.json, runs.json, …)
```

## Commands (run inside `client/`)

```sh
pnpm dev          # web on :3000 (needs the API on :3001)
pnpm typecheck
pnpm test         # vitest + jsdom, fetch mocked; no API or Docker needed
pnpm exec vitest run PRRow   # filter by plain substring — `[repoId]` paths break filters
```

## Conventions

- Components: `PascalCase/PascalCase.tsx` + `index.ts` re-export; tests next to
  them as `PascalCase.test.tsx`. Route-private components go in `_components/`.
- Styles are inline style objects in `styles.ts` (`s.row(h)`), not CSS files.
- User-visible strings go to `messages/en/*.json` (`useTranslations("prReview")`).
- Hooks: `useXxx` in `src/lib/hooks/<area>.ts`.
- `@devdigest/shared` resolves to the client's OWN copy in `src/vendor/shared/`;
  a new API field must be added here as well as in the server copy.
- Money: format with `src/lib/format-usd.ts`; unknown cost renders `—`, never `$0.00`.
