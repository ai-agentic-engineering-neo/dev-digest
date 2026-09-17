# client — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Next.js 15 (App Router, `src/app/`), React 19, TS 5.7, `@tanstack/react-query`, `next-intl`. Build: `pnpm build`. Test: `pnpm test` (vitest). Typecheck: `pnpm typecheck`.

## Read when

- changing routing/layout → `docs/README.md`
- adding a feature → check `specs/` for its spec first
- **before any work → `INSIGHTS.md` (read first, always)**

## Do not touch

- `src/vendor/shared/`, `src/vendor/ui/` — hand-duplicated copies (`@devdigest/shared` also lives in `server/src/vendor/shared/`). Not a workspace symlink; keep both in sync manually.
