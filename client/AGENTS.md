# client/ — @devdigest/web

Next.js 15 studio UI. Full picture: [README.md](./README.md).

## Stack
Next.js 15 (App Router), React 19, TanStack Query, `next-intl`, `recharts`,
`mermaid`, `react-markdown`. Node ≥22, pnpm ≥10, vitest + jsdom. Standalone
package — own `package.json`/lockfile, no workspace.

## Commands
- `pnpm dev` — web app on :3000
- `pnpm build` / `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked (no API needed)

## What lives where
- `src/app/**/page.tsx` — routes (App Router). Pages are thin; feature logic sits
  in colocated `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `src/components/app-shell` — cross-cutting chrome (nav, breadcrumbs, shortcuts).
- `src/lib/hooks/*` — TanStack Query data hooks, calling `src/lib/api.ts`.
- `src/vendor/ui/` — vendored `@devdigest/ui` design system.
  See [vendor/ui/AGENTS.md](./src/vendor/ui/AGENTS.md).
- `src/vendor/shared/` — vendored copy of `@devdigest/shared` Zod contracts.
- `docs/` — client-specific design notes. `specs/` — feature specs.

## Non-default conventions
- **Always import UI from the `@devdigest/ui` barrel**, never reach into a layer
  file directly (`src/vendor/ui/primitives/Button.tsx` etc.).
- **API base is `NEXT_PUBLIC_API_BASE`** (default `http://localhost:3001`), used
  by `src/lib/api.ts` — every data hook goes through it.
- Real browser journeys are covered by [`../e2e`](../e2e/AGENTS.md), not by
  component tests here — component tests never touch the API or a browser.

## Gotchas
Running log of non-obvious decisions and hard-won lessons: [INSIGHTS.md](./INSIGHTS.md).
The `engineering-insights` skill keeps this updated proactively — Claude appends
entries as issues are found and during end-of-session wrap-ups, so treat it as
current guidance, not a write-only log.

## Do not touch
- `src/vendor/ui/**` — vendored design system; edits should be deliberate (see its
  own AGENTS.md) and kept usable across the whole app.
- `src/vendor/shared/**` — vendored; changes must be mirrored by hand into `server/src/vendor/shared`.

## Links
[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md) ·
[vendor/ui/AGENTS.md](./src/vendor/ui/AGENTS.md) · [Testing strategy](../TESTING.md) ·
[Root AGENTS.md](../AGENTS.md)
