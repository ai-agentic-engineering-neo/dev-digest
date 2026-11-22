# client — insights

Read via the `engineering-insights` skill. Rules live in `client/CLAUDE.md`; setup in `client/README.md`.

## What works

- **Component tests need no API**: `pnpm test` (vitest + jsdom) mocks `fetch`. Browser journeys are covered by `e2e/`, not here. [2026-11-20]

## What does not work

- _None yet._

## Codebase patterns

- **Components never call `fetch`.** All server data goes through hooks in `src/lib/hooks/*`, which call `src/lib/api.ts`. Change endpoints, caching or error handling in those two places only. [2026-11-20]
- **Pages stay thin.** Feature logic lives in colocated `_components/<Name>/` folders, each with its own `*.test.tsx`. [2026-11-20]
- **Vendored copies, not packages**: `src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`). A contract change must be copied to the server's `src/vendor/shared` too. Watch for: a type error that appears on only one side of the API boundary. [2026-11-20]
- **App-shell chrome** (nav, breadcrumbs, `g`-then-key shortcuts) lives in `src/components/app-shell`. [2026-11-20]
- **UI strings go in `messages/<locale>/*.json`** (next-intl), never hard-coded in components. [2026-11-20]

## Tool and library notes

- _None yet._

## Recurring errors and fixes

- _None yet._

## Session notes

- _None yet._

## Open questions

- _None yet._

## Legacy entries

## 2026-11-20 — Component tests mock fetch, not the API
Vitest + jsdom tests mock `fetch` so they need no API, DB or browser. Real user
journeys are covered by `e2e/`.
Why: fast, hermetic component tests; browser flows stay a small, deterministic set.

## 2026-11-20 — All data access goes through hooks
Components never call `fetch` directly. Hooks in `src/lib/hooks/*` wrap `src/lib/api.ts`.
Why: one place to change endpoints, caching and error handling.

## 2026-11-20 — Vendored UI and contracts are copies
`src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`) are
copies, not published packages. A contract change must be synced to the server copy.
Watch for: a type error that only appears on one side of the API boundary.
