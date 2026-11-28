# DevDigest — agent guide (CLAUDE.md v1)

Local-first AI pull-request review: import a PR from GitHub, run an LLM reviewer
agent on its diff, show grounded findings in the UI.

## Stack and repository layout

**Not a monorepo workspace.** Four standalone packages, each with its own
`package.json` and lockfile. Cross-package code is shared through **tsconfig
path aliases**, not published modules. Run every command from inside the
package folder.

| Folder | Package | Stack | Port | Package manager |
|---|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify 5 + Drizzle ORM + Postgres (pgvector), Zod type provider | 3001 | pnpm |
| `client/` | `@devdigest/web` | Next.js 15 App Router, React, TanStack Query, next-intl | 3000 | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → findings → grounding. No DB/GitHub/FS | — | **npm** |
| `e2e/` | `@devdigest/e2e` | Deterministic agent-browser flows (`specs/*.flow.json`) | — | **npm** |

Shared code:
- `@devdigest/shared` = Zod contracts. There are **two vendored copies**:
  `server/src/vendor/shared/` and `client/src/vendor/shared/`. They have already
  drifted (comments and some fields differ). When you change a contract the
  client uses, change **both** copies.
- `@devdigest/reviewer-core` is imported by the server from
  `../reviewer-core/src` (alias in `server/tsconfig.json`).
- `@devdigest/ui` (client UI primitives: `Badge`, `Icon`, `CircularScore`, …)
  lives in `client/src/vendor/ui/`.

Only Postgres runs in Docker (`docker-compose.yml`); API and web run on the host.

### Where things live

```
server/src/
  server.ts, app.ts          Fastify bootstrap
  modules/<feature>/         routes.ts · service.ts · repository.ts · helpers.ts · constants.ts
    pulls/                   GET /repos/:id/pulls (list + GitHub sync), GET /pulls/:id
    reviews/                 POST /pulls/:id/review, run-executor.ts, findings, runs, traces
    agents/ repos/ settings/ repo-intel/ workspace/ polling/
  platform/                  container (DI), run-logger, SSE RunBus, price-book, errors
  adapters/                  llm (openai/anthropic/openrouter + pricing.ts), github, git, mocks.ts
  db/schema/*.ts             Drizzle tables (runs.ts = agent_runs + run_traces)
  db/migrations/             generated SQL + meta/_journal.json
  vendor/shared/             Zod contracts (server copy)
client/src/
  app/                       Next.js routes; feature components in `_components/<Name>/`
    repos/[repoId]/pulls/    PR list (PRRow, FilterBar)
    repos/[repoId]/pulls/[number]/   PR detail: FindingsTab, FindingsPanel, RunTraceDrawer, …
  lib/api.ts                 apiFetch → http://localhost:3001
  lib/hooks/*.ts             TanStack Query hooks (core.ts = repos/pulls, reviews.ts, trace.ts)
  lib/types.ts               re-exports contract types from @devdigest/shared
  vendor/shared, vendor/ui   contracts (client copy), UI primitives
  messages/en/*.json         next-intl strings (prReview.json, runs.json, …)
reviewer-core/src/
  review/run.ts              reviewPullRequest(): select mode → prompt → LLM → reduce → ground
  prompt.ts grounding.ts review/reduce.ts llm/openrouter.ts
```

### Main workflow: PR import → findings in the UI

1. **Import** — there is no separate import action. The client `usePulls`
   (`client/src/lib/hooks/core.ts`) calls `GET /repos/:id/pulls`
   (`server/src/modules/pulls/routes.ts`), which syncs PRs from GitHub into
   `pull_requests` on every read (idempotent upsert on repo_id+number) and
   falls back to persisted rows when offline. `polling/routes.ts` is not used by
   the UI.
2. **Trigger** — `RunReviewDropdown` → `POST /pulls/:id/review` →
   `reviews/service.ts` creates one `agent_runs` row per agent and starts
   `ReviewRunExecutor` (`reviews/run-executor.ts`) in the background.
3. **Execute** — `run-executor.ts` loads the diff (`reviews/diff-loader.ts`),
   adds repo-intel context (callers, repo map, rank note), then calls
   `reviewPullRequest` from reviewer-core (prompt → LLM → reduce → grounding
   gate → score).
4. **Persist** — review + findings, `completeAgentRun` (tokens, duration,
   score) and ONE `run_traces` jsonb document (config, stats, prompt assembly,
   raw output, full log). Live events stream via `RunLogger` → `RunBus` → SSE
   `GET /runs/:id/events`.
5. **Show** — PR page uses `usePrReviews` (`GET /pulls/:id/reviews`) →
   `FindingsTab` → `ReviewRunAccordion` → `FindingsPanel` → `FindingCard`;
   `RunTraceDrawer` reads `GET /runs/:id/trace`.

## Commands

Prerequisites: Node ≥ 22, pnpm ≥ 10, Docker.

```sh
./scripts/dev.sh                 # Postgres + env files + install + migrate + seed + API + web
                                 # flags: --no-seed --no-client --db-only
docker compose up -d             # Postgres only

# server/
pnpm dev                         # API on :3001 (tsx watch)
pnpm db:migrate                  # NOT run on boot — run after pulling new migrations
pnpm db:seed                     # idempotent demo data
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit tests, no Docker
pnpm exec vitest run .it.test                      # integration tests, need Docker
pnpm exec vitest run test/<file>.test.ts           # one file

# client/
pnpm dev                         # web on :3000
pnpm typecheck
pnpm test                        # vitest + jsdom, fetch mocked

# reviewer-core/
npm run typecheck && npm test
```

Definition of done for a change: `typecheck` + unit tests pass in every
package you touched (server changes also need reviewer-core typecheck if you
touched it, and vice versa). CI workflows are path-filtered per package
(`.github/workflows/*.yml`).

## Naming conventions

- TypeScript everywhere, ESM. Server imports use the `.js` suffix
  (`import { x } from './helpers.js'`).
- Server modules: `modules/<feature>/{routes,service,repository,helpers,constants}.ts`.
  Routes are Fastify plugins (`export default async function xRoutes(app)`)
  with Zod schemas via `fastify-type-provider-zod`.
- **API JSON is snake_case** (`head_sha`, `files_count`, `cost_usd`); Drizzle
  columns are camelCase in TS and snake_case in SQL (`tokensIn: integer('tokens_in')`).
  Map explicitly in routes/helpers (`reviewToDto`, …).
- Contracts: a Zod schema and its type share the same PascalCase name
  (`export const PrMeta = z.object(...)`; `export type PrMeta = z.infer<typeof PrMeta>`).
- Client components: `PascalCase/PascalCase.tsx` + `index.ts` re-export, tests
  next to them as `PascalCase.test.tsx`. Route-private components go in
  `_components/`. Styles are inline style objects in `styles.ts` (`s.row(h)`),
  not CSS files. User-visible strings go to `client/messages/en/*.json`
  (`useTranslations("prReview")`).
- Hooks: `useXxx` in `client/src/lib/hooks/<area>.ts`.
- Tests: server `server/test/<area>.test.ts`; DB-backed tests **must** end in
  `.it.test.ts`. Use `server/src/adapters/mocks.ts` (MockLLMProvider,
  MockGitClient) instead of real network/keys.

## Do not touch

- **Existing migrations** `server/src/db/migrations/*.sql` and `meta/` — never
  edit. Schema change = edit `db/schema/*.ts`, then `pnpm db:generate` creates a
  new migration. Prefer avoiding a schema change if a jsonb field (e.g.
  `run_traces.trace`) can carry the data.
- **Lockfiles** `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json` — do not edit by
  hand and do not add dependencies without asking.
- `server/package.json` is `skip-worktree` locally (a local variant diverges);
  do not rely on scripts that only exist locally.
- `.claude/skills/*` third-party skills and `skills-lock.json` — vendored, do not edit.
- Runtime data: `server/clones/`, `.devdigest/cache/`, `.env` files — never commit.

## Gotchas

- Migrations are not applied on boot: `relation ... does not exist` = run `pnpm db:migrate`.
- reviewer-core already computes `costUsd` per run (`reviewer-core/src/review/run.ts`);
  OpenRouter returns real cost in `usage.cost`, other providers use
  `server/src/adapters/llm/pricing.ts` / `platform/price-book.ts`.

## Session protocol

- **Before work:** read the `INSIGHTS.md` of every module you will touch
  (`client/`, `server/`, `reviewer-core/`, `e2e/`) and treat it as
  high-confidence guidance.
- **After a coding task:** run the `engineering-insights` skill
  (`.claude/skills/engineering-insights/SKILL.md`) and append non-obvious
  findings to the module's `INSIGHTS.md`. Do not skip this step.
