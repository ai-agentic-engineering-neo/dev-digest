# client — @devdigest/web (Next.js 15 App Router, :3000)

## Commands
`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm test` (vitest + jsdom, fetch mocked — no API needed)

## Map
- `src/app/**/page.tsx` — thin route pages; feature UI in colocated `_components/<Name>/`
- `src/lib/api.ts` — the ONLY place that calls `fetch` (`apiFetch`, `ApiError`)
- `src/lib/hooks/*` — TanStack Query hooks per domain (agents, reviews, repo-intel, trace, core)
- `src/components/` — app-wide pieces (app-shell, diff-viewer, page-shell…)
- `src/vendor/ui/` — design system `@devdigest/ui` · `src/vendor/shared/` — Zod contracts (copy of server's)
- `messages/en/*.json` — next-intl strings, one file per namespace

## Conventions
- Data access: component → hook in `lib/hooks` → `apiFetch`. No `fetch` in components or pages.
- Import UI only from the barrel `@devdigest/ui` — never `@devdigest/ui/primitives/...` (only exception: `@devdigest/ui/styles.css` in the root layout).
- Component folder shape: `Name.tsx` + `index.ts` + optional `constants.ts` / `helpers.ts` / `styles.ts` / `Name.test.tsx`.
- User-facing text goes through `useTranslations("<namespace>")` + `messages/en/<namespace>.json`, not hardcoded strings.

## Gotchas
- `src/vendor/shared` is a manual copy of `server/src/vendor/shared` and lags behind it (e.g. its `LLMProvider.id` lacks `'openrouter'`). Update from server, don't edit only here.
- `vendor/ui` and `messages/` already contain parts for future milestones (LiveLogStream, ExportWizardSteps, eval/blast/ci messages) — unused ≠ dead, keep them.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Deeper
[README.md](README.md) (route map → API) · [design system](src/vendor/ui/README.md) · [INSIGHTS.md](INSIGHTS.md) · [docs/](docs/) · [specs/](specs/)
