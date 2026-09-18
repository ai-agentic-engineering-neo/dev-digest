# client (@devdigest/web)

## Before answering

Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Tech stack

Next.js 15 (App Router), React 19, TanStack Query for all server data,
`next-intl` (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
`react-markdown`. UI primitives are vendored under `src/vendor/ui`
(`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
(`@devdigest/shared`). Talks only to the Fastify API (`server/`), never to
GitHub or Postgres directly.

## Commands

- Run: `pnpm dev` (`:3000`, needs `NEXT_PUBLIC_API_BASE` pointing at the API).
- Test: `pnpm test` (vitest + jsdom, `fetch` mocked — no API/browser needed).
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint` (eslint).

## Naming conventions

- Relative imports carry the `.js` extension even though the source is
  `.ts`/`.tsx` (ESM, matches server/reviewer-core).
- Route-local feature logic lives in `_components/<Name>/` (PascalCase)
  colocated with its route; anything shared ACROSS routes lives in
  `src/components/<name>/` (kebab-case) — see `client/INSIGHTS.md`.
- Every component gets a co-located `*.test.tsx`; styles extracted to a
  sibling `styles.ts` exporting a single `s` object.

## Conventions (not obvious from code)

- Types/contracts come from `@devdigest/shared` (Zod, vendored under
  `src/vendor/shared`) — never hand-duplicate them.
- All API access goes through `src/lib/api.ts`; every data hook lives in
  `src/lib/hooks/*`.
- Feature logic is colocated in `_components/<Name>/` next to each route —
  pages themselves stay thin.

## Do-not-touch

- `src/vendor/**` — see root `CLAUDE.md`'s do-not-touch (synced-copy convention).
- `pnpm-lock.yaml` — never hand-edit, only regenerate via `pnpm install`.

## Use when

- Route map, commands → read `README.md`
- Deep-dives → `client/docs/` · UI/flow specs → `client/specs/` · running
  notes → `client/INSIGHTS.md`
- Real-browser verification of a flow → `../e2e/README.md`
- Cross-package rules (vendoring, ESM imports) → `../CLAUDE.md`
