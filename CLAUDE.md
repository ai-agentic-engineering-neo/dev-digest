# DevDigest

Local-first AI pull-request review. Course starter: import a PR, run an agent
review, persist grounded findings. Overview and architecture: `README.md`.
Testing strategy: `TESTING.md`.

This file is intentionally short. Each package has its own `CLAUDE.md`, loaded
automatically when you touch files there. Read the linked docs only when the
task needs them.

## Before answering or changing anything

1. Search the curated docs first: the relevant package's `CLAUDE.md`, `README.md`, `docs/`, `specs/`, and `INSIGHTS.md`, plus the root `docs/`. They may already answer the question or record a decision.
2. Then read the code. Verify what the docs claim against the actual source before relying on it.
3. Before the first change in a package, state the two or three `INSIGHTS.md` entries most relevant to the task. Treat them as high-confidence guidance unless the code proves otherwise.

## Engineering insights (every session)

Learnings live per package in `INSIGHTS.md`, append-only, written only through
the `engineering-insights` skill (`.claude/skills/engineering-insights/`).

- Capture immediately after a user correction, a failed approach, a fix whose cause was elsewhere, a decision with a rejected alternative, or a tool surprise.
- At the end of every non-trivial task run the skill's wrap-up sweep for each package touched. Do not skip it; an empty sweep is a valid result.
- Never hand-edit an `INSIGHTS.md`; use `insight.sh add`. Never delete or rewrite an entry; correct it with a new dated one.
- Rule for every entry: if anyone reading the code would see it, do not write it.

## Layout

Independent packages, no workspace. Each has its own lockfile. Cross-package
code is shared through tsconfig path aliases, not published modules.

| Folder | Package | What | Guide |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify 5 + Drizzle + Postgres (pgvector), `:3001` | `server/CLAUDE.md` |
| `client/` | `@devdigest/web` | Next.js 15 studio UI, `:3000` | `client/CLAUDE.md` |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → grounded findings | `reviewer-core/CLAUDE.md` |
| `e2e/` | `@devdigest/e2e` | Deterministic browser flows (agent-browser) | `e2e/CLAUDE.md` |
| `server/src/vendor/shared/` | `@devdigest/shared` | Zod contracts + adapter interfaces (canonical copy) | see `server/CLAUDE.md` |

## Commands

```sh
./scripts/dev.sh     # Postgres (Docker) → migrate → seed → API + web
./scripts/e2e.sh     # hermetic e2e stack on alternate ports, then teardown
```

Checks, per package (`pnpm` in `server/` and `client/`, `npm run` in
`reviewer-core/` and `e2e/`): `typecheck` · `test` · `lint` (ESLint flat
config, `eslint.config.mjs`). Full per-package script list in each
package's `CLAUDE.md`.

## Rules that apply everywhere

- Package managers: `pnpm` in `server/` and `client/`; `npm` in `reviewer-core/` and `e2e/`.
- Contracts live in `server/src/vendor/shared`. Change them there, then copy to `client/src/vendor/shared`. The two copies must match.
- Secrets never go in git, the DB, or `AppConfig`. They flow through `SecretsProvider` (`~/.devdigest/secrets.json`, env fallback).
- Migrations do not run on boot. Run `cd server && pnpm db:migrate`.
- Never run `docker compose down -v`. It deletes the dev volume with every imported repo.
- Tests are typological, not exhaustive. Server DB-backed tests end in `.it.test.ts`.
- Commit messages: conventional prefix with scope, e.g. `feat(reviews): …`, `fix(dev): …`, `ci(server): …`.

## Naming conventions

- **Packages:** `@devdigest/<folder>` (`api`, `web`, `reviewer-core`, `e2e`, `shared`). Folders are kebab-case.
- **Server modules:** `server/src/modules/<kebab-name>/` with the fixed trio `routes.ts` · `service.ts` · `repository.ts`, plus `helpers.ts` / `constants.ts` when needed. Classes are PascalCase and suffixed by role (`ReviewService`, `ReviewRepository`, `ReviewRunExecutor`); adapters implement a `@devdigest/shared` interface and are named by vendor (`SimpleGitClient`, `OpenRouterProvider`).
- **Database:** tables are snake_case plural (`agent_runs`, `pull_requests`), columns snake_case (`cost_usd`); the Drizzle property is the camelCase twin (`costUsd`). Migrations keep the drizzle-kit name (`0010_huge_marten_broadcloak.sql`) and are never renamed.
- **API JSON:** snake_case fields end to end (`tokens_in`, `cost_usd`, `run_id`), matching the Zod contracts. A route path is plural resource then id: `/pulls/:id/runs`, `/runs/:id/trace`.
- **Contracts (`@devdigest/shared`):** a Zod schema and its inferred type share one PascalCase name (`export const RunSummary = z.object(…)` + `export type RunSummary = z.infer<…>`), grouped per file under `contracts/`.
- **Client components:** one PascalCase folder per component under `_components/`, `<Name>.tsx` + `index.ts`, with colocated `styles.ts`, `constants.ts`, `helpers.ts`, `<Name>.test.tsx`. Cross-page components live in `client/src/components/<kebab-name>/`. Hooks are `use<Thing>` in `src/lib/hooks/<domain>.ts`. i18n keys are camelCase under a dotted namespace (`prReview.list.columns.cost`).
- **Styles:** CSS variables are `--kebab-case` (`--text-muted`, `--crit-bg`); severity and category tokens are the upper-case `SEV` / `CAT` maps from `@devdigest/ui`.
- **Tests:** `<name>.test.ts(x)` beside the code; server DB-backed tests end in `.it.test.ts`; e2e flows are `NN-kebab-name.flow.json`.
- **Env and secrets:** `UPPER_SNAKE_CASE` (`API_PORT`, `OPENROUTER_API_KEY`); the secret name in `~/.devdigest/secrets.json` equals the env var name.
- **Git:** branches `feat/<kebab>` · `fix/<kebab>`; commits `type(scope): imperative summary` (`feat(reviews): …`).

## Do not touch

Never edit these by hand. Change them only through the tool that owns them, or not at all.

- **Lockfiles:** `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`. Only the package manager writes them.
- **Vendored skills:** `.claude/skills/` and `skills-lock.json`. They are pinned by hash to upstream sources; re-vendor instead of editing.
- **Contract copy:** `client/src/vendor/shared/`. Edit `server/src/vendor/shared/` and copy the result over. Never edit the client copy directly.
- **Design system:** `client/src/vendor/ui/`. Change it only when the task is explicitly about the design system, and add any new component to `/showcase`.
- **Generated migration files:** `server/src/db/migrations/*.sql` and `meta/`. Produced by `pnpm db:generate`; edit the schema in `src/db/schema/` instead. Never rewrite a committed migration.
- **Runtime and local data:** `server/clones/`, `e2e/test-results/`, `.env` files, `.idea/`, `*.log`, `node_modules/`, `.next/`, `dist/`, `~/.devdigest/`. Git-ignored or machine-specific; never commit or clean them up as part of a task.

## Where to read more (on demand)

- Per-package `README.md`: architecture, diagrams, env tables.
- Per-package `docs/`: design notes. `specs/`: feature specs. `INSIGHTS.md`: non-obvious learnings and gotchas.
- `docs/agent-prompts/`: how reviewer prompts are assembled and the rules for writing them.
- `.claude/skills/`: vendored skills (Fastify, Drizzle, Next.js, React, Zod, security, …). Only descriptions load at session start; bodies load when a task matches.
