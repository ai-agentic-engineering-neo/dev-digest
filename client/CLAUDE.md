# client/CLAUDE.md

Map for `@devdigest/web`. Root map: [../CLAUDE.md](../CLAUDE.md). Deep dive: [README.md](README.md).

## Role

Next.js 15 (App Router) UI — browse repos/PRs, run reviews, read findings, author
agents. Talks to the API over `NEXT_PUBLIC_API_BASE` (default `:3001`) via
TanStack Query hooks in `src/lib/hooks/*`.

## Run / test

```sh
pnpm dev          # :3000
pnpm test         # vitest + jsdom + React Testing Library
pnpm typecheck
```

## Non-default conventions

- Route-scoped components live in that route's `_components/<PascalCaseName>/`
  (Next.js private-folder convention): `<Name>.tsx` + optional
  `.test.tsx` / `helpers.ts` / `constants.ts` / `styles.ts` / `index.ts`.
- Generic/shared components (`src/components/<name>/`) are **kebab-case**
  instead — the PascalCase rule is only for route-local components.
- One hooks file per domain in `src/lib/hooks/` (`agents.ts`, `reviews.ts`, …),
  exporting `use*` hooks — not one file per hook.
- i18n strings live in `messages/<locale>/*.json`, read via `next-intl`.

## Learnings

Read [`INSIGHTS.md`](INSIGHTS.md) before starting work here — if it has
entries, note the ones relevant to this task before proceeding.

## Gotchas

- `src/vendor/shared` is a **manually duplicated copy** of
  `server/src/vendor/shared` — not a symlink. If you change a contract, copy the
  change to both sides by hand.
- `src/vendor/ui` (`@devdigest/ui`) is vendored UI primitives, not an npm package.

## Do not touch

- `pnpm-lock.yaml`.
