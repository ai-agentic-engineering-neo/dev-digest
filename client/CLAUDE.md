# client — @devdigest/web

Next.js 15 studio UI. The root `CLAUDE.md` applies; this adds client-only rules.

## Use when

- Adding a page or a hook, or wiring to the API → read `README.md` (route map → hooks → `api.ts`)
- Adding or changing a UI component → read `src/vendor/ui/README.md`, then add it to `/showcase`
- Implementing a feature → read its spec in `specs/`; write one first if it is missing
- Something surprised you, or a fix was not obvious → `INSIGHTS.md`, through the
  `engineering-insights` skill, which carries the format and the rules
- Need depth the README does not give → `docs/`

## Rules not visible from any single file

- Pages are thin. Feature logic lives in the route's `_components/<Name>/` — PascalCase folder and
  file, with a colocated `*.test.tsx`.
- Relative imports have **no** extension here (`from "./core"`), unlike `server` and
  `reviewer-core` — Next bundles this code, it does not run as raw ESM.
- Data flows only through `src/lib/hooks/*` → `src/lib/api.ts` (TanStack Query). No `fetch` in components.
- UI primitives come only from the `@devdigest/ui` barrel — never import a layer file directly.
  Colors come from CSS variables, never hard-coded.
- User-facing strings live in `messages/en/<area>.json` (next-intl), not inline in JSX.
- Contracts come from `src/vendor/shared`, which can lag the server's copy. When a type looks wrong,
  diff it against `server/src/vendor/shared`.

## Commands (client-only)

```sh
pnpm dev          # :3000
pnpm test         # vitest + jsdom, fetch mocked — needs neither API nor browser
pnpm typecheck
```

Env: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
