# client/CLAUDE.md — @devdigest/web

Next.js 15 (App Router) studio, port 3000. Repo-wide rules:
[../CLAUDE.md](../CLAUDE.md).

## Stack

Next.js 15 · React 19 · TanStack Query · `next-intl` (messages in
`messages/<locale>/*.json`) · `recharts` · `mermaid` · `react-markdown`. UI
primitives vendored under `src/vendor/ui` (`@devdigest/ui`); shared Zod
contracts under `src/vendor/shared` (`@devdigest/shared`).

## Commands

```sh
pnpm dev          # :3000
pnpm typecheck
pnpm test         # vitest + jsdom, fetch mocked — no API needed
```

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) points every data
hook at the API.

## Where things live

- `src/app/**/page.tsx` — routes: `/`, `/repos/:repoId/pulls`,
  `/pulls/:number`, `/agents`, `/agents/:id`, `/settings/:section`,
  `/onboarding`
- `src/app/**/_components/<Name>/` — colocated feature logic + `*.test.tsx`; pages themselves stay thin
- `src/lib/hooks/*` — one TanStack Query hook module per domain (`agents.ts`,
  `core.ts`, `repo-intel.ts`, `reviews.ts`, `trace.ts`) → `src/lib/api.ts`
- `src/components/app-shell` — cross-cutting chrome: nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/{ui,shared}` — vendored, not npm-installed (see root [CLAUDE.md](../CLAUDE.md))

## Non-default conventions

- Data fetching only goes through `src/lib/hooks/*` → `src/lib/api.ts`. No
  component calls `fetch`/the API base directly.
- `src/vendor/shared` is a hand-copy of the server's Zod contracts, not an
  installed package — edit both copies when a contract changes.
- i18n strings live in `messages/<locale>/*.json`, not inline — even for
  starter-only English copy.

## Gotchas

- Tests mock `fetch`; they need neither the API nor a browser. Real browser
  journeys (client + API + seeded DB) belong in [`../e2e`](../e2e/README.md), not here.

## Do-not-touch without reading first

- `src/vendor/shared/` — mirrored by hand from `server/src/vendor/shared`; see root [CLAUDE.md](../CLAUDE.md).
- `src/vendor/ui/` — vendored design-system primitives; prefer composing them over patching internals.
- `pnpm-lock.yaml` — never hand-edit; regenerate via `pnpm install` after a `package.json` change.

## Read When

- **Adding/changing a route or the data-fetching pattern** → [docs/ui-architecture.md](docs/ui-architecture.md)
- **Changing what a page must show/guarantee** → [specs/pages.md](specs/pages.md)
- **Hit unexpected behavior here** → [INSIGHTS.md](INSIGHTS.md)

## Docs map

- [README.md](README.md) — UI route map diagram, stack, test notes
- [docs/](docs/) — deep-dive reference (routing, data-fetching, component conventions)
- [specs/](specs/) — behavioral specs (what each page must guarantee)
- [INSIGHTS.md](INSIGHTS.md) — append-only dev log of session findings
