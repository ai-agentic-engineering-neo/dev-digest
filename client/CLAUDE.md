# client — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Next.js 15 (App Router, `src/app/`), React 19, TS 5.7, `@tanstack/react-query`, `next-intl`. Run: `pnpm dev` (port 3000). Build: `pnpm build`. Test: `pnpm test` (vitest). Typecheck: `pnpm typecheck`. Lint: not configured.

## Read when

- changing routing/layout → `docs/README.md`
- adding a feature → check `specs/` for its spec first
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

`_components/<PascalCase>/` per feature, styled with a co-located `styles.ts` (inline `CSSProperties` — no CSS modules, no Tailwind classes in JSX). i18n namespace = its `messages/en/<name>.json` filename. See root `CLAUDE.md` § Naming for the full convention.

## Do not touch

- `src/vendor/shared/`, `src/vendor/ui/` — hand-duplicated copies (`@devdigest/shared` also lives in `server/src/vendor/shared/`). Not a workspace symlink; keep both in sync manually.
- `pnpm-lock.yaml` — never hand-edit; regenerate via `pnpm install` after a `package.json` change.
