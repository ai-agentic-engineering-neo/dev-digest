# DevDigest — monorepo map

Local-first AI pull-request review. Four standalone packages (no workspace — each
has its own `package.json`/lockfile; cross-package code is shared through
tsconfig path aliases, not published modules). This file is the entry point;
each package has its own deeper `CLAUDE.md` for internal structure/gotchas.

## Packages

| Folder | Package | Role | CLAUDE.md |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify API + Drizzle/Postgres (pgvector) — clones/indexes repos, serves PRs, orchestrates LLM reviews via `reviewer-core` | [server/CLAUDE.md](server/CLAUDE.md) |
| `client/` | `@devdigest/web` | Next.js 15 studio UI — import repos, browse PRs, run/read AI reviews, author agents | [client/CLAUDE.md](client/CLAUDE.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → grounded findings. No DB/GitHub/filesystem access | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| `e2e/` | `@devdigest/e2e` | Deterministic browser e2e flows (Vercel `agent-browser`, no LLM) | [e2e/CLAUDE.md](e2e/CLAUDE.md) |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts shared across every package (single source of truth; mirrored read-only into `client/src/vendor/shared`) | — |

`repo-intel` (codebase indexer powering the **Indexed** badge) lives inside the
server at [`server/src/modules/repo-intel`](server/src/modules/repo-intel) — not
a separate package.

## Stack (by package)

- **server** — Fastify 5.2 · Drizzle ORM 0.38 (Postgres/pgvector) · Zod 3.24 (`fastify-type-provider-zod`) · TypeScript 5.7 · Vitest 2.1
- **client** — Next.js 15 (App Router) · React 19 · TanStack Query 5.62 · next-intl 3.26 · mermaid 11.15 · react-markdown 9 · TypeScript 5.7 · Vitest 2.1
- **reviewer-core** — TypeScript 5.7 · Vitest 2.1 · Zod 3.24 · `openai` SDK 4.77 (talks to any OpenAI-compatible provider, incl. OpenRouter)
- **e2e** — TypeScript 5.7 · `tsx` 4.19 · `agent-browser` CLI (external binary)

## Commands

### Run

```sh
./scripts/dev.sh          # Postgres (Docker) + migrate + seed + API (:3001) + web (:3000)
```

Manual per-package: `server`: `pnpm dev` (`:3001`) · `client`: `pnpm dev` (`:3000`).
Flags for the script: `--no-seed` · `--no-client` · `--db-only` · `--help`.

### Verify

| Package | typecheck | test | lint |
|---|---|---|---|
| `server` | `pnpm typecheck` | `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic) / `pnpm exec vitest run .it.test` (real Postgres) | `pnpm lint` |
| `client` | `pnpm typecheck` | `pnpm test` | `pnpm lint` |
| `reviewer-core` | `npm run typecheck` | `npm test` | `npm run lint` |
| `e2e` | `npm run typecheck` | `npm test` (`tsx run.ts`, needs a running stack) | `npm run lint` |

## Naming conventions

- **Colocated feature components** (client): `_components/<PascalCaseName>/<PascalCaseName>.tsx`, with sibling `styles.ts` (co-located inline-style objects), `helpers.ts` (pure functions), `constants.ts`, and an `index.ts` barrel. Pages (`page.tsx`) stay thin; feature logic lives in the colocated folder next to the route.
- **Test files**: `*.test.ts` / `*.test.tsx` next to the source file they cover. Server-only: `*.it.test.ts` = integration (needs real Postgres, testcontainers); everything else is hermetic.
- **Zod contracts** (`server/src/vendor/shared`, mirrored to `client/src/vendor/shared`): the schema constant and its inferred TS type share one name — `export const PrMeta = z.object({...}); export type PrMeta = z.infer<typeof PrMeta>;`.
- **Drizzle schema** (`server/src/db/schema`): camelCase JS field → snake_case SQL column, explicit on every column (`prId: uuid('pr_id')`). REST/Zod payload fields are snake_case to match (`cost_usd`, `start_line`), not camelCase.
- **Branches/commits**: conventional-commit-style prefixes (`feat:`, `fix:`, `revert:`) — see `git log` for the house style.

## Do-not-touch

- `src/vendor/` (`server`, `client`) — synced/vendored shared code (`@devdigest/shared`, `@devdigest/ui`); local edits get silently overwritten by the next sync. Change the source of truth in `server/src/vendor/shared`, not the copy.
- `server/src/db/migrations/` — already-applied migration files are immutable history; never hand-edit one. New schema changes go through `pnpm db:generate` (Drizzle Kit), which appends a new migration file.
- Lock files — `pnpm-lock.yaml` (`server`, `client`), `package-lock.json` (`e2e`), `package-lock.json`/equivalent (`reviewer-core`). Never hand-edit; regenerate via `pnpm install` / `npm install` only. (`e2e` specifically uses **npm**, not pnpm — see [`e2e/CLAUDE.md`](e2e/CLAUDE.md) gotchas.)

## Docs

- [README.md](README.md) — architecture diagram, quick start, troubleshooting
- [TESTING.md](TESTING.md) — CI/test strategy across all packages
- Each package's own `CLAUDE.md`, `README.md`, `docs/`, `docs/specs/`, `INSIGHTS.md` — see the per-package files linked above
