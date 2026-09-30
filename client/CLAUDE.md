# client (`@devdigest/web`)

## Overview

Next.js 15 (App Router) + React 19 studio UI over the Fastify API: import
repos, browse pull requests, run/read AI reviews, author agents.

## Commands

- `pnpm dev` — web app on `:3000`.
- `pnpm test` — vitest + jsdom, `fetch` mocked; no API or browser needed.
- `pnpm typecheck`.

## Conventions

- Data access is TanStack Query hooks over `src/lib/api.ts`
  (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`). Every data hook
  lives in `src/lib/hooks/*` — don't call `fetch` directly from a component.
- Pages (`src/app/**/page.tsx`) are thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
  Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in
  `src/components/app-shell`.
- UI primitives are vendored under `src/vendor/ui` (`@devdigest/ui`); shared
  Zod contracts under `src/vendor/shared` (`@devdigest/shared`) — copies, not
  npm deps. `src/vendor/shared` must stay in sync with
  `server/src/vendor/shared` by hand (no shared package to import from).
- New user-facing strings go into `messages/<locale>/*.json`
  (`next-intl`), not hardcoded in JSX.

## Do not touch

- `.next/` — build output.
- `src/vendor/shared` in isolation — a contract change here without the
  matching change in `server/src/vendor/shared` breaks type/schema parity
  between client and API.

## Gotchas

- Component tests never hit a real API or browser (`fetch` is mocked) — they
  don't prove a real user journey; that's what `../e2e` covers.
- `client/pnpm-workspace.yaml` only sets `pnpm.allowBuilds` for native
  postinstall scripts (esbuild/sharp) — it does not make this package part
  of a workspace with anything else; it's still installed/run standalone.

## Reference

- `client/README.md` — read first: full UI route map, stack, testing notes.
- `../TESTING.md` — read before any test change.
- `../e2e/README.md` — read before claiming a UI change is "tested end to
  end"; component tests alone don't cover that.
- `client/docs/`, `client/specs/` — deeper design notes / formal specs;
  currently empty placeholders, read when populated.
- `../.claude/rules/` — always-applied project rules; authoritative over
  this file if it ever contains anything.
