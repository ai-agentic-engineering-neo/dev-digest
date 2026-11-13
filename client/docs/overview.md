# client — overview

## Responsibility
The studio UI: onboarding (add repo), PR list per repo, PR detail (overview · diff · findings/runs with live SSE
trace), agents list + editor, settings (API keys, models). Next.js 15 App Router, all pages are `"use client"`
and read the Fastify API through TanStack Query hooks in `src/lib/hooks/*` over `src/lib/api.ts`.

## What it does NOT do
- No business logic on review data beyond display grouping (`src/components/finding-severity/helpers.ts`).
  Scores, costs, and severity counts arrive computed from the API (`PrMeta.score`, `cost_usd`, `severity_counts`).
- No `fetch` inside components. Only `apiFetch` in `src/lib/api.ts`; SSE for run events is opened in `src/lib/hooks/reviews.ts`.
- No server-side data fetching or route handlers: `src/app/**/page.tsx` are thin client entries (`src/app/settings/[section]/page.tsx` is 3 lines).
- No hand-written API types: everything comes from `@devdigest/shared` via `src/lib/types.ts`.
- No imports from `server/` or `reviewer-core/`. The only cross-package link is HTTP to `NEXT_PUBLIC_API_BASE`.

## Dependencies
| Direction | What | Evidence |
|---|---|---|
| out → `@devdigest/shared` (own copy) | `PrMeta`, `RunSummary`, `ReviewRecord`, `Finding`, `Settings`, … | `src/vendor/shared`, aliased in `tsconfig.json` and `vitest.config.ts`; `src/lib/types.ts` re-exports |
| out → `@devdigest/ui` | primitives, kit, shell, command palette, icons | `src/vendor/ui/index.ts`; used by `src/components/app-shell/AppShell.tsx`, `src/app/repos/[repoId]/pulls/page.tsx` |
| out → server (HTTP) | every endpoint in `README.md` route map | `src/lib/hooks/core.ts`, `reviews.ts`, `agents.ts`, `trace.ts`, `repo-intel.ts` |
| in ← `e2e` | browser flows locate text/roles rendered here | `e2e/specs/*.flow.json` wait on strings like "9,500 tok · $0.014" |
| in ← nothing else | no package imports client code | — |

`src/vendor/shared` is a hand-maintained copy of `server/src/vendor/shared` and currently diverges
(`adapters.ts`, `contracts/{trace,knowledge,eval-ci,productionize}.ts`). Patch the same field into both copies.

## Public interface
- Routes under `src/app/`: `/`, `/onboarding`, `/repos/[repoId]/pulls`, `/repos/[repoId]/pulls/[number]`,
  `/agents`, `/agents/[id]`, `/settings/[section]`. Map with API calls per route: `README.md`.
- Shared components exported from `src/components/<kebab>/index.ts` (e.g. `run-cost-badge`, `finding-severity`, `app-shell`).
- Hooks barrel `src/lib/hooks/index.ts`; import `@/lib/hooks` or a domain file directly.
- i18n namespaces = file names in `messages/en/*.json`, merged by `src/i18n/request.ts`; use `useTranslations("<ns>")`.

## Invariants
- Response types come from `@devdigest/shared`; UI-only view models live in `src/lib/types.ts` (`PrRowView`).
- Every `_components/<Name>/` and `src/components/<kebab>/` ships `<Name>.test.tsx`; tests render with `NextIntlClientProvider` and real `messages/en/*.json` (`src/components/run-cost-badge/RunCostBadge.test.tsx`).
- User-visible strings go through next-intl; i18n JSON is edited by targeted text edits, never re-serialized (`INSIGHTS.md`).
- Unknown cost renders "—", never "$0.00" (`src/lib/format-cost.ts`).
- Popovers portal to `document.body` and stop propagation so row `router.push` handlers do not fire (`src/components/finding-severity/FindingsPopover.tsx`).
- Query defaults: `retry: 1`, `staleTime: 30 s`, no refetch on focus (`src/lib/providers.tsx`); running-run lists poll every 4 s until idle (`src/lib/hooks/reviews.ts`).
- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`); the server's CORS allows only `WEB_PORT`.
