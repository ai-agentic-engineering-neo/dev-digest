# client/ — `@devdigest/web` (Next.js 15 App Router, React 19)

## Before answering

Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Commands (pnpm, run in `client/`)

- `pnpm dev` (`:3000`) · `pnpm test` (vitest + jsdom; tests `vi.mock` the hook modules — no global fetch mock) · `pnpm typecheck` · `pnpm build`
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

## Naming conventions

- Route folders lowercase; dynamic segments `[camelCase]`: `app/repos/[repoId]/pulls/[number]/`, `app/settings/[section]/`.
- Page = `page.tsx` default-exporting `<Name>Page` (`PullsPage`, `PRDetailPage`, `AgentEditorPage`).
- Route-local component: `_components/<PascalCase>/<PascalCase>.tsx` (`FindingsPanel/FindingsPanel.tsx`);
  sub-components nest as `<Parent>/_components/<Child>/` (`FindingsPanel/_components/SeverityCounters/`).
- `index.ts` re-exports named + default: `export { FindingCard, FindingCard as default } from "./FindingCard"`.
- Sibling files keep fixed names: `styles.ts` exports one object `s`; `constants.ts` SCREAMING_SNAKE
  (`SEV_COLOR_FALLBACK`, `SKELETON_ROWS`); `helpers.ts` camelCase pure fns (`countBySeverity`, `visibleFindings`).
- Tests colocated: `<Name>.test.tsx` for components, `helpers.test.ts` for helpers; app-wide smoke in `src/test/smoke.test.tsx`.
- App-level shared components: kebab-case folder, PascalCase file — `src/components/run-cost-badge/RunCostBadge.tsx`.
- Data hooks: one file per API domain in `src/lib/hooks/<domain>.ts` (kebab: `repo-intel.ts`), re-exported by `index.ts`.
  Queries `use<Noun>` (`usePrRuns`, `usePullDetail`), mutations `use<Verb><Noun>` (`useCreateAgent`, `useCancelRun`).
- Component-private hooks: one hook per file `hooks/use<Name>.ts` (`components/app-shell/hooks/useGlobalShortcuts.ts`).
- TanStack query keys: `[<kebab-string>, id]` — `["pr-runs", prId]`, `["repo-intel-state", repoId]`; reuse the exact
  key string when invalidating.
- Other `src/lib/` modules kebab-case (`github-urls.ts`, `repo-context.tsx`, `model-label.ts`).
- i18n: one namespace per file `messages/en/<camelCase>.json` (`prReview.json`, `agentPerformance.json`) =
  `useTranslations("prReview")`; keys nested camelCase (`panel.severityFilter`, `finding.suggestedFix`); ICU args `{severity}`.

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
