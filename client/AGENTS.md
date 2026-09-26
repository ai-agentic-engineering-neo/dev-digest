# client — `@devdigest/web`

Next.js 15 (App Router) + React 19 + TanStack Query. The studio UI over the
Fastify API. Route map: `README.md`.

## Commands (pnpm)

```sh
pnpm dev         # :3000
pnpm typecheck
pnpm lint        # eslint . (react-hooks rules included)
pnpm test        # vitest + jsdom, fetch mocked; no API or browser needed
```

## Layout

- `src/app/**/page.tsx` — thin route entries. Logic lives in colocated `_components/<Name>/` folders: component, `index.ts`, `styles.ts`, `constants.ts`, `helpers.ts`, `*.test.tsx`.
- `src/lib/api.ts` — `apiFetch` + `ApiError`. `src/lib/hooks/*` — all React Query hooks, one file per domain.
- `src/components/` — cross-page pieces: app-shell, diff-viewer, page-shell.
- `src/vendor/ui/` — `@devdigest/ui` design system. Import from the barrel only. Layers and tokens: `src/vendor/ui/README.md`.
- `src/vendor/shared/` — copy of `@devdigest/shared`. The canonical copy is `server/src/vendor/shared`.
- `messages/en/*.json` — next-intl strings.

## Conventions

- Data flows hook → `api.*` → Fastify. No raw `fetch` in components.
- Mutations invalidate their list query on success. Global error toasts live in `src/lib/providers.tsx`: mutations always toast, queries only on network or 5xx.
- Styles are inline `CSSProperties` objects in `styles.ts`. Colors come from CSS variables (`var(--accent)`, `var(--text-muted)`), never hard-coded.
- Severity and category colors come from `SEV`/`CAT` tokens in `@devdigest/ui`. Prefer `SeverityBadge`/`CategoryTag` over reading the maps.
- New UI component: add it to the `/showcase` route. The smoke test mounts that gallery.
- Tests: React Testing Library with user-facing queries and a mocked `fetch`.
- `NEXT_PUBLIC_API_BASE` is the only env the app reads.

## Do not touch by hand

`pnpm-lock.yaml` · `src/vendor/shared/` (copy; edit the server one and sync) · `src/vendor/ui/` unless the task is about the design system · `.next/`. Full list in the root `AGENTS.md`.

## Read when relevant

- `README.md` · `src/vendor/ui/README.md`
- `docs/ui-architecture.md` when touching providers, hooks, `api.ts`, the app shell, the PR detail composition, or the Server/Client boundary.
- `specs/pages.md` when adding or changing a route, its URL params, states, or which e2e flow covers it.
- `specs/run-cost-badge.md` when touching `RunCostBadge`, `format-cost.ts`, or any cost surface.
- `specs/skills.md` when touching `/skills`, `/skills/[id]`, the agent editor Skills tab, `hooks/skills.ts` or the import drawer.
- `specs/conventions.md` when touching `/conventions`, `hooks/conventions.ts` or the Create-skill modal.
- `INSIGHTS.md` before the first change in this package (toast policy, contract drift, cost threshold, test setup gotchas).
- `../e2e/` for the browser journeys that exercise this UI.
