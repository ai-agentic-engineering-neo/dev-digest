# client — CLAUDE.md

## Stack

Next.js 15 (App Router), React 19, TanStack Query, next-intl, recharts, mermaid,
react-markdown. Details — [README](./README.md).

## Commands

`pnpm dev` (`:3000`) · `pnpm build` · `pnpm test` (vitest + jsdom, `fetch` mocked) · `pnpm typecheck`
No lint step exists in this package — the check gate is `pnpm typecheck` + `pnpm test`.

## Map

- `src/app/**/page.tsx` — routes (App Router)
- `src/lib/hooks/*` → `src/lib/api.ts` — every call to the API
- `src/components/app-shell` — navigation, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/shared`, `src/vendor/ui` — vendored (copied, not an npm
  dependency) `@devdigest/shared` and `@devdigest/ui`
- Feature logic lives in colocated `_components/<Name>/`, each with its own
  `*.test.tsx`

## Non-default conventions

- Data flows exclusively through TanStack Query hooks in `src/lib/hooks/*`,
  never `fetch` directly in components.
- `src/vendor/shared`/`src/vendor/ui` are copies from `server`; syncing is
  manual, this isn't the source of truth.

## Gotchas

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) — if the API runs on
  a different port, dev/tests break silently, with no clear error.
- Real browser flows aren't tested here — see [`../e2e`](../e2e/CLAUDE.md).

## Naming conventions

Repo-wide rules — [../CLAUDE.md](../CLAUDE.md#naming-conventions). Client-specific:

- Route-local feature code lives in `_components/<Name>/` (underscore keeps it
  out of the App Router's route table), with `<Name>.tsx`, `<Name>.test.tsx`
  and, when needed, `styles.ts` / `helpers.ts` / `constants.ts` / `index.ts`.
  Cross-route components go in `src/components/<kebab-name>/`.
- Hooks are `useThing()`, grouped by domain in `src/lib/hooks/<domain>.ts`
  (`reviews.ts`, `agents.ts`, `trace.ts`) — not one file per hook.
- Server DTO fields keep their wire spelling (`cost_usd`, `findings_by_severity`)
  all the way into JSX; only local variables are `camelCase`.
- i18n keys are `camelCase` and dotted by surface: `prReview.severity.critical`,
  `runs.trace.stat.cost` (`messages/en/<namespace>.json`).

## Do-not-touch

- `src/vendor/shared`, `src/vendor/ui` — don't hand-edit; ask before changing
  the vendoring mechanism itself.
- **`pnpm-lock.yaml` — never hand-edit, never delete to "fix" an install.**
  It changes only as the by-product of a pnpm command (this package is pnpm,
  not npm).

## Read when

- Need the full package description, ports, scripts → read [README.md](./README.md).
- Planning a new feature → start with [specs/](./specs/), then write code.
- Need deeper notes on a feature that don't belong in this file → [docs/](./docs/).
- Need the architecture of the whole pipeline (not just client) → read [../docs/architecture.md](../docs/architecture.md).
- Before changing something non-trivial — check whether we've already hit this wall → [INSIGHTS.md](./INSIGHTS.md).
