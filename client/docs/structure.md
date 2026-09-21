# client — structure

## Folders
| Path | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout: next-intl provider, theme no-flash script, `Providers` (React Query + theme + active repo + toasts). |
| `src/app/page.tsx` | `/`: redirects to the first repo's PR list or shows the onboarding empty state. |
| `src/app/<route>/page.tsx` | Thin route entries. Feature logic sits in the sibling `_components/<Name>/`. |
| `src/app/repos/[repoId]/pulls/` | PR list: `page.tsx`, `constants.ts` (`COLUMN_KEYS`), `helpers.ts`, `styles.ts`, `_components/{PRRow,FilterBar}`. |
| `src/app/repos/[repoId]/pulls/[number]/_components/` | PR detail: `PrDetailHeader`, `OverviewTab`, `DiffTab`, `FindingsTab`, `ReviewRunAccordion`, `VerdictBanner`, `FindingsPanel`, `SeverityFilterPills`, `FindingCard`, `RunHistory`, `RunTraceDrawer`, `RunReviewDropdown`, `RunStatus`. |
| `src/app/agents/` | `AgentsListView`, `AgentCard`; `[id]/page.tsx` is the editor. |
| `src/app/settings/[section]/_components/SettingsView/` | Settings sections (API keys, models) with nested `_components/`. |
| `src/components/<kebab>/` | Cross-route components: `app-shell` (nav, breadcrumbs, `g`-then-key shortcuts in `hooks/`), `diff-viewer`, `finding-severity`, `run-cost-badge`, `page-shell`, `repo-not-found`, `mermaid-diagram`, `showcase`. |
| `src/lib/api.ts` | `API_BASE`, `ApiError`, `apiFetch`, `api.get/post/put/delete`. The single HTTP client. |
| `src/lib/hooks/` | TanStack Query hooks by domain: `core.ts` (settings, repos, pulls), `agents.ts`, `reviews.ts` (runs, SSE, findings actions), `trace.ts`, `repo-intel.ts`; barrel `index.ts`. |
| `src/lib/` | `types.ts` (re-exports from shared + `PrRowView`), `format-cost.ts`, `github-urls.ts`, `model-label.ts`, `feature-models.ts`, `providers.tsx`, `repo-context.tsx`, `theme.tsx`, `toast.tsx`. |
| `src/i18n/request.ts` | Loads `messages/en/*.json` into namespaces; single locale `en`, no locale routing. |
| `messages/en/` | One JSON per namespace (`common`, `prReview`, `runs`, `agents`, `settings`, `shell`, …). |
| `src/vendor/shared/` | Local copy of `@devdigest/shared` (see `overview.md`). `src/vendor/ui/` = `@devdigest/ui` design system. |
| `src/test/setup.ts` | jest-dom matchers + `ResizeObserver` stub for jsdom. |
| `specs/` | Feature contracts: `001-run-cost-badge.md`, `002-findings-severity.md`, template in `README.md`. |

## Entry points
- Dev: `pnpm dev` (:3000). Prod: `pnpm build` then `pnpm start` (what `.github/workflows/e2e-web.yml` runs).
- Config: `next.config.mjs` (next-intl plugin, `NEXT_PUBLIC_API_BASE`), `vitest.config.ts` (jsdom, aliases, `src/**/*.test.{ts,tsx}`), `eslint.config.mjs`, `postcss.config.mjs`.

## Component folder convention
`_components/<Name>/` = `<Name>.tsx` · `<Name>.test.tsx` · `index.ts` · optional `styles.ts` (exports `s`), `helpers.ts`, `constants.ts`.
Complete example: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`.

## Reference files
- To see a small shared component with i18n and its test, read `src/components/run-cost-badge/RunCostBadge.tsx` and `RunCostBadge.test.tsx`.
- To see a list row that composes hooks, popovers, and navigation, read `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`.
- To see a page that filters/sorts API data and renders loading/error/empty states, read `src/app/repos/[repoId]/pulls/page.tsx`.
- To see query, mutation, polling, and SSE hooks for one domain, read `src/lib/hooks/reviews.ts`.
- To see a portaled hover popover with scroll and propagation guards, read `src/components/finding-severity/FindingsPopover.tsx`.
