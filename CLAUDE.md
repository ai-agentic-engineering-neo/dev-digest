# DevDigest — root map

Monorepo: `client` (Next.js) · `server` (Fastify + Drizzle) · `reviewer-core` (review engine lib) · `e2e` (flow test runner).

No root package.json — 4 standalone packages, each own lockfile. Cross-package code shared via tsconfig path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`), not published/workspace deps. Run/build/test per-module (see each module's `CLAUDE.md`). Only Postgres runs in Docker; client/server run on host via `pnpm dev`.

## Read when

- touching `client/*` → read `client/CLAUDE.md` first
- touching `server/*` → read `server/CLAUDE.md` first
- touching `reviewer-core/*` → read `reviewer-core/CLAUDE.md` first
- touching `e2e/*` → read `e2e/CLAUDE.md` first
- need cross-module architecture → `docs/architecture.md`
- need agent-prompt tuning → `docs/agent-prompts/README.md`

## Session protocol

- **Before any work:** read the touched module's `INSIGHTS.md` and name the 1-3 entries
  that bear on this task. Treat them as high-confidence guidance unless told otherwise.
- **When wrapping up:** run `/engineering-insights` to capture what the session learned.
  If nothing non-obvious came up it writes nothing — that is the expected outcome, not a
  skipped step.
- Which file: `.claude/skills/engineering-insights/scripts/detect-module.sh`.

## Naming

- **Files/dirs:** feature code lives in co-located `_components/<PascalCase>/` folders, each with `<Name>.tsx`, `index.ts`, and as needed `styles.ts` (inline `CSSProperties`, never CSS modules/Tailwind classes), `constants.ts`, `helpers.ts`, `<Name>.test.tsx`. Pure logic that isn't a component goes directly in `helpers.ts`/`constants.ts` next to its consumer, not a shared `utils/`.
- **Server modules:** one `src/modules/<kebab-case>/` per bounded area (`pulls`, `reviews`, `agents`, …) owning its own `routes.ts`; cross-cutting code lives in `_shared/` or `platform/`.
- **DB:** tables/columns `snake_case` in Postgres, camelCase in Drizzle schema (`src/db/schema/*.ts`), one schema file per table group.
- **API contracts:** every request/response shape is a Zod schema in `vendor/shared/contracts/*.ts`, PascalCase export name matching its inferred type (`export const PrMeta = z.object(...); export type PrMeta = z.infer<typeof PrMeta>`). JSON wire fields are `snake_case`; once destructured into TS they're camelCase — the Zod schema is the seam.
- **i18n:** one file per feature area under `messages/en/<namespace>.json`; components read it via `useTranslations("<namespace>")`, so the namespace name IS the filename.
- **Tests:** co-located, `<Name>.test.ts(x)`; integration tests needing Postgres are `*.it.test.ts` and skip themselves when Docker isn't available (`dockerAvailable()`).

## Do not touch

- `server/src/db/migrations/` journal — never overwrite wholesale (merge conflicts must append, not replace history). See `server/INSIGHTS.md`.
- `*/src/vendor/shared/` and `client/src/vendor/ui/` — hand-duplicated across packages (no real workspace symlink). Edit both copies or diff before assuming one is source of truth.
- Lock files (`client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`) — never hand-edit; regenerate only through the package manager (`pnpm install` / `npm install`) after changing a `package.json`.
