# DevDigest — agent guide (CLAUDE.md v2)

Local-first AI pull-request review: import a PR from GitHub, run an LLM reviewer
agent on its diff, show grounded findings in the UI.

This file is a **map**, not documentation. Module conventions live in each
module's own `CLAUDE.md` (loaded when you work there); details live in README /
`docs/` and are linked, not copied. Follow a link only when its "read when"
matches your task.

## Modules

**Not a monorepo workspace.** Four standalone packages, each with its own
`package.json` and lockfile. Run every command from inside the package folder.

| Folder | Package | Stack | PM | Module guide |
|---|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify 5, Drizzle, Postgres+pgvector, :3001 | pnpm | [server/CLAUDE.md](server/CLAUDE.md) |
| `client/` | `@devdigest/web` | Next.js 15 App Router, TanStack Query, next-intl, :3000 | pnpm | [client/CLAUDE.md](client/CLAUDE.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → findings → grounding | **npm** | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| `e2e/` | `@devdigest/e2e` | deterministic agent-browser flows | **npm** | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

Every module has the same layout of knowledge:
`README.md` (how it works) · `docs/` (deeper notes) · `specs/` (feature specs
and plans) · `INSIGHTS.md` (agent-written lessons) · `CLAUDE.md` (rules).

Cross-module wiring (the part no single module guide can show):
- `@devdigest/shared` (Zod contracts) is **vendored twice**:
  `server/src/vendor/shared/` and `client/src/vendor/shared/`. They have
  drifted. A contract the client uses → change **both** copies.
- The server imports reviewer-core from source (`../reviewer-core/src`, alias in
  `server/tsconfig.json`), so a reviewer-core change is a server change too.
- Only Postgres runs in Docker (`docker-compose.yml`); API and web run on the host.

## Main workflow: PR import → findings in the UI

1. **Import** — `usePulls` (`client/src/lib/hooks/core.ts`) → `GET /repos/:id/pulls`
   (`server/src/modules/pulls/routes.ts`) syncs PRs from GitHub on every read.
2. **Trigger** — `RunReviewDropdown` → `POST /pulls/:id/review` →
   `reviews/service.ts` creates one `agent_runs` row per agent.
3. **Execute** — `reviews/run-executor.ts` loads the diff + repo-intel context,
   calls `reviewPullRequest` (`reviewer-core/src/review/run.ts`).
4. **Persist** — review + findings, `completeAgentRun` (tokens, duration, cost,
   score) and ONE `run_traces` jsonb document; live events via SSE `/runs/:id/events`.
5. **Show** — `usePrReviews` → `FindingsTab` → `ReviewRunAccordion` →
   `FindingsPanel`; `RunTraceDrawer` reads `GET /runs/:id/trace`.

## Commands

Prerequisites: Node ≥ 22, pnpm ≥ 10, Docker.

```sh
./scripts/dev.sh          # Postgres + env + install + migrate + seed + API + web
                          # flags: --no-seed --no-client --db-only
```

Per-module commands (typecheck, tests, migrations) are in each module's `CLAUDE.md`.
**Definition of done:** `typecheck` + unit tests pass in every module you touched.
CI is path-filtered per module (`.github/workflows/*.yml`).

## Global conventions

- TypeScript everywhere, ESM. **API JSON is snake_case** (`head_sha`, `cost_usd`).
- Everything committed to GitHub is in **English** (code, comments, docs, PRs).
- Contracts: a Zod schema and its type share one PascalCase name.

## Do not touch

- **Existing migrations** `server/src/db/migrations/*.sql` and `meta/` — never
  edit; a schema change = edit `db/schema/*.ts` + `pnpm db:generate`. Why:
  [server/CLAUDE.md](server/CLAUDE.md#migrations).
- **Lockfiles** — never edit by hand; no new dependencies without asking.
- `.claude/skills/*` third-party skills and `skills-lock.json` — vendored.
- Runtime data: `server/clones/`, `.devdigest/cache/`, `.env` files — never commit.

## Read when

- Changing the review pipeline / prompt blocks → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
- Adding or debugging tests / CI → [TESTING.md](TESTING.md)
- Setting up from zero / troubleshooting the stack → [README.md](README.md)

## Session protocol

- **Before work (after reading the user's request):** identify the module(s)
  the task touches and read their `INSIGHTS.md`. Treat it as high-confidence
  guidance unless told otherwise. State in one line which insights apply.
- **After a coding task:** run the `engineering-insights` skill
  (`.claude/skills/engineering-insights/SKILL.md`). It appends only new,
  substantive findings and never overwrites existing entries. Do not skip it.
