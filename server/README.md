# `@devdigest/api` — the engine (Fastify + Postgres)

The DevDigest backend: imports repos, stores agents/skills/memory, runs the
Structured Reviewer, computes blast radius / briefs / conformance, ingests CI
results, and exports agents to CI. Fastify 5 + Drizzle ORM over Postgres
(pgvector). Adapters (LLM, GitHub, git, embeddings, ast-grep, …) sit behind a DI
container so they can be swapped for mocks in tests.

- **Stack:** Fastify 5, Drizzle ORM, `postgres`, pgvector, `fastify-sse-v2`
  (streaming run traces), Zod contracts from `src/vendor/shared` (`@devdigest/shared`).
- **Run:** `pnpm dev` (`:3001`). **Migrate/seed:** `pnpm db:migrate`,
  `pnpm db:seed`. **Test:** `pnpm test:unit` / `pnpm test:integration`.
- **No keys required to boot:** `loadConfig` (`src/platform/config.ts`) marks
  every secret optional; keys can also be set at runtime via Settings.

## Request & DI flow

```mermaid
flowchart LR
  REQ["HTTP request"] --> CORS["cors + SSE plugins"]
  CORS --> ERR["error handler<br/>ZodError → 422 · AppError → status"]
  ERR --> MOD["feature module plugin<br/>modules/&lt;name&gt;/routes.ts"]
  MOD --> SVC["service<br/>(e.g. ReviewService)"]
  SVC --> DI{"DI container<br/>platform/container.ts"}
  DI --> ADP["adapters (§5 ports)<br/>llm · github · git · embedder · astgrep · tokenizer · secrets"]
  ADP -->|"prod"| EXT["LLM · GitHub · git · pgvector"]
  ADP -->|"tests"| MOCK["src/adapters/mocks.ts<br/>MockLLMProvider · MockEmbedder · MockGitClient"]
  SVC --> DB[("Drizzle → Postgres")]
  SVC -. "run traces" .-> SSE["SSE stream → client"]
```

Modules are registered statically in `src/modules/index.ts` (one import + one
`app.register` each); the engine reaps orphaned `running` runs on boot.

## API map

Each module owns its routes (`modules/<name>/routes.ts`). Grouped by domain:

```mermaid
flowchart TB
  subgraph Repos_PRs["Repos & PRs"]
    repos["repos<br/>/repos"]
    pulls["pulls<br/>/pulls/:id"]
    polling["polling"]
    brief["brief<br/>/pulls/:id/brief"]
    blast["blast<br/>/pulls/:id/blast"]
  end
  subgraph Review["Review & runs"]
    reviews["reviews<br/>/reviews · /findings"]
    runs["runs<br/>/runs (SSE traces)"]
    compose["compose"]
    conformance["conformance"]
  end
  subgraph Knowledge["Agents & knowledge"]
    agents["agents<br/>/agents"]
    skills["skills<br/>/skills · /skills/community"]
    conventions["conventions"]
    memory["memory<br/>/memory"]
    context["context"]
  end
  subgraph Intel["Repo intelligence"]
    repoIntel["repo-intel<br/>symbols · phantoms"]
    onboarding["onboarding<br/>tour"]
    digest["digest"]
  end
  subgraph Ops["Eval, CI & platform"]
    evalM["eval<br/>/eval/dashboard · /eval-cases"]
    ci["ci<br/>/ci-runs · export-to-CI"]
    hooks["hooks"]
    performance["performance · stats"]
    plugins["plugins<br/>/plugins"]
    settings["settings<br/>/providers · /settings"]
    workspace["workspace"]
  end
  HEALTH["/health → {status:ok}"]
```

## Environment

`server/.env` (copied from `.env.example`):

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://devdigest:devdigest@localhost:5432/devdigest` | required to migrate/serve |
| `API_PORT` | `3001` | |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GITHUB_PAT` | — | optional; also settable via Settings UI |
| `DEVDIGEST_CLONE_DIR` | `./clones` | imported-repo checkouts (git-ignored) |
| `NODE_ENV` | `development` | `test` → silent logs |

Migrations are **not** applied on boot — run `pnpm db:migrate` (pgvector is
enabled by migration `0000`). `pnpm db:seed` is idempotent demo data
(`acme/payments-api`, PR #482, sample agents/skills/memory).

## Testing

The suite splits by filename — `*.it.test.ts` is DB-backed, everything else is
hermetic:

- **unit** — `pnpm exec vitest run --exclude '**/*.it.test.ts'` — the ~19
  DB-free files. Adapters mocked; no Docker.
- **integration** — `pnpm exec vitest run .it.test` — the 12 `*.it.test.ts`
  files. Each starts a real Postgres via testcontainers (`test/helpers/pg.ts`),
  builds the app, migrates + seeds, and exercises routes end-to-end. They
  self-skip when Docker is absent.
- `pnpm test` runs both.

> `server/package.json` is kept `skip-worktree` (a local variant diverges from the
> committed file), so CI uses the `pnpm exec vitest …` forms above rather than
> committed `test:unit` / `test:integration` scripts.

A DB-backed test (one that imports `test/helpers/pg.ts`) **must** use the
`*.it.test.ts` suffix so the split stays correct. See [`../TESTING.md`](../TESTING.md).
