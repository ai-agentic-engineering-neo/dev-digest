# client — `@devdigest/web`

Next.js 15 studio UI. Repo-wide rules are in [../CLAUDE.md](../CLAUDE.md);
project overview in [../README.md](../README.md); UI route map in
[README.md](README.md). Do not repeat them here.

## Commands (pnpm, run from `client/`)

```sh
pnpm dev          # web on :3000, expects the API on :3001
pnpm typecheck
pnpm test         # vitest + jsdom, fetch mocked, no API needed
pnpm build
```

## Where things live

- `src/app/**/page.tsx` — routes (App Router)
- `src/app/**/_components/<Name>/` — feature logic, colocated with its test
- `src/lib/api.ts` — the only place that calls the API
- `src/lib/hooks/` — every TanStack Query hook
- `src/components/app-shell/` — nav, breadcrumbs, keyboard shortcuts
- `messages/en/*.json` — all user-facing strings (`next-intl`)
- `src/vendor/ui/` — `@devdigest/ui` design system
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (client copy)

## Conventions

- Pages stay thin. Logic goes into `_components/<Name>/` with a `*.test.tsx`
  beside it.
- Data access is `page → hook in src/lib/hooks → src/lib/api.ts`. Do not call
  `fetch` from a component.
- Types for API data come from `@devdigest/shared`. Do not redeclare them.
- Import UI only from the `@devdigest/ui` barrel, never from a layer file.
  Check it for an existing component before writing a new one.
- No hardcoded user-facing strings; add a key under `messages/en/`.
- Colors and spacing come from the CSS variables in the UI stylesheet, not
  literal values.

## Gotchas

- `src/vendor/shared` is a separate copy from `server/src/vendor/shared`. A
  contract changed on the server must be mirrored here or types drift silently.
- The API base URL is `NEXT_PUBLIC_API_BASE`; it is inlined at build time.
- Tests mock `fetch`, so a passing client suite says nothing about the real
  API contract. Browser journeys are covered in `../e2e`.
- Changing visible text, a route, or a tab label can break the e2e flows,
  which assert on `--text` and `--url`. Check `../e2e/specs/` after UI changes.

## Do not touch

- `src/vendor/ui/**` — the design system; extend it deliberately, in its own
  layer structure, not as a side effect of a feature.
- `.env` — local config.
- `.next/` — build output.

## Read when

- Adding a page or hook → read `README.md` (route map).
- Adding or changing a UI component → read `src/vendor/ui/README.md`.
- Adding a hook or touching the API boundary → read `docs/architecture.md`.
- Building a milestone screen → read its spec in `specs/` (write it first).
- Writing tests → read `../TESTING.md`.
- Before starting → read `INSIGHTS.md` and `LEARNINGS.md`; treat both as
  high-confidence guidance.
- When a task ends or something non-obvious happens → run the
  `engineering-insights` skill (appends to `LEARNINGS.md`).
