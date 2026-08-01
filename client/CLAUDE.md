# `@devdigest/web` — agent guide

Next.js 15 App Router + React 19. The studio UI over the Fastify API.

## Before answering

Curated docs here today: `INSIGHTS.md` (this package's traps), `README.md` (UI route
map, stack, testing), `../TESTING.md`, and the root `../INSIGHTS.md` — which is where
the vendored-contract drift affecting this package is recorded, since it crosses
packages. No `docs/` or `specs/` here yet — read those first, then code.

## Conventions (not obvious from code)

- **Import style differs from the server**: double quotes, and relative imports carry **no** extension (`../lib/hooks`, not `../lib/hooks.js`). The `.js` suffixes you see under `src/vendor/shared/` are inherited from the server copy — don't spread that style into app code.
- **Relative paths, not `@/`.** The `@/*` alias exists but is barely used; match the surrounding file. `@devdigest/ui` and `@devdigest/shared` aliases point at `src/vendor/*` — those are real and used everywhere.
- **`src/vendor/shared/` is a hand-maintained copy** of `server/src/vendor/shared/` and currently lags it (e.g. no `openrouter` provider, no `AgentManifest`). To change a contract: edit the server copy, then port the delta here. Editing only this copy silently desyncs the API.
- **Data goes through hooks, not components.** Every fetch lives in `src/lib/hooks/*` (TanStack Query) over `src/lib/api.ts`; base URL is `NEXT_PUBLIC_API_BASE`. No `fetch` in a component.
- **Pages are thin.** Feature logic sits in colocated `_components/<Name>/` folders, each with its own `*.test.tsx`. Cross-cutting chrome lives in `src/components/app-shell`.
- **All user-facing strings go through `next-intl`** — `messages/<locale>/*.json`.
- Tests run under vitest + jsdom with `fetch` mocked; they need neither API nor browser.

## Do-not-touch

- `src/vendor/shared/` — mirror of the server's canonical contracts (see above).
- `src/vendor/ui/` — vendored component kit; treat as a library, not app code.

## Use when

- UI route map and which API each screen leans on → `README.md`
- Test lanes → `../TESTING.md`
- Server-side shape of an endpoint → `../server/README.md`
- Next / React / RTL / Zod idioms → `../.claude/skills/`
