
DevDigest: onboarding walkthrough

1. Project overview

DevDigest is a local-first AI pull-request reviewer. You point it at a GitHub repo. It clones and indexes the repo, imports the open PRs, and runs one or more "agents" over each PR's diff. An agent is an LLM plus a system prompt. The output is a set of structured, line-anchored findings, each with a severity, plus a verdict and a score.

The problem it addresses is that plain "paste a diff into an LLM" reviews hallucinate line numbers, are easy to talk out of real issues via prompt injection, and have no context about the rest of the codebase. The design answers each of these:

┌────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│        Problem         │                                            How the code answers it                                            │
├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Hallucinated locations │ Grounding gate (reviewer-core/src/grounding.ts): any finding whose line range doesn't touch a real diff hunk  │
│                        │ is dropped                                                                                                    │
├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Model self-grading     │ The score is recomputed from the surviving findings; the model's own score is ignored (review/run.ts)         │
├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Prompt injection via   │ All untrusted content is wrapped in <untrusted> blocks, and one shared INJECTION_GUARD is appended to every   │
│ PR text                │ system prompt (reviewer-core/src/prompt.ts)                                                                   │
├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ No codebase context    │ repo-intel indexes the repo when it's cloned and adds a repo map and a "high blast-radius" note to the prompt │
└────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

This repo is also explicitly a starter template for a course or roadmap (README "Roadmap", milestones M1–M8). That framing explains a lot of what follows: the schema, the shared contracts, and the engine already contain hooks for features that don't exist yet.

2. Architecture and module relationships

mermaid
flowchart LR
  subgraph Browser
    WEB["client/ (Next.js 15, :3000)<br/>pages → hooks → api.ts"]
  end

  subgraph API["server/ (Fastify 5, :3001)"]
    direction TB
    GUARD["onRequest Host/Origin guard<br/>helmet · cors · rate-limit · SSE"]
    MODS["feature modules<br/>repos · pulls · polling · agents<br/>reviews · repo-intel · settings · workspace"]
    CONT["DI Container<br/>platform/container.ts"]
    JOBS["JobRunner (p-queue + jobs table)"]
    BUS["RunBus (in-memory SSE bus)"]
    GUARD --> MODS --> CONT
    CONT --> JOBS
    CONT --> BUS
  end

  subgraph Engine["reviewer-core/ (pure, no I/O)"]
    RPR["reviewPullRequest()<br/>prompt → LLM → reduce → ground"]
  end

  PG[("Postgres 16 + pgvector<br/>(Docker)")]
  GH["GitHub API (Octokit)"]
  GIT["git clones on disk<br/>~/.devdigest/workspace"]
  LLM["OpenRouter / OpenAI / Anthropic"]
  SEC["~/.devdigest/secrets.json"]

  WEB -- "REST (fetch)" --> GUARD
  WEB -- "SSE /runs/:id/events" --> GUARD
  MODS -- "imports source via tsconfig alias" --> RPR
  RPR -- "injected LLMProvider" --> LLM
  CONT --> PG
  CONT --> GH
  CONT --> GIT
  CONT --> SEC

What each package is responsible for

- client/: The UI, which the README calls "the studio". It is thin: pages compose colocated _components/, and every data access goes through src/lib/hooks/* (TanStack Query), which calls src/lib/api.ts. It never talks to the DB or the LLM directly.
- server/: Owns all I/O. That means HTTP, Postgres, git clones, GitHub, secrets, background jobs, and live run streaming. It is organised as feature modules (src/modules/<name>/). Each module is a Fastify plugin with up to four layers: routes.ts (transport), service.ts (logic), repository.ts (Drizzle queries), and helpers.ts/constants.ts. Smaller modules (pulls, polling, settings, workspace) skip the service layer and query the DB from the route directly.
- server/src/platform/: Cross-cutting infrastructure: config, the DI container, errors, the job runner, the SSE bus, the Host/Origin guard, and resilience helpers.
- server/src/adapters/: "Ports and adapters" implementations behind interfaces declared in @devdigest/shared/adapters.ts. These cover the LLM, GitHub, git, ripgrep, ast-grep, dependency-cruiser, the tokenizer, secrets and auth, plus mocks.ts for tests.
- reviewer-core/: The pure review engine. Its only side effect is calling an injected LLMProvider. It has no DB, filesystem or GitHub access, which is why it's trivially unit-testable.
- server/src/modules/repo-intel/: The codebase indexer. It writes symbols, an import graph, PageRank file ranks and a cached repo map to Postgres. Reviews only read it through a facade (container.repoIntel).
- @devdigest/shared (server/src/vendor/shared): Zod schemas that act as the contract between all packages. They also serve as Fastify route schemas.
- e2e/: Deterministic browser flows against a seeded stack, with no LLM involved.

3. Technology stack

┌────────────┬──────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
│   Layer    │                               Tech                               │                      Role / why                       │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ API        │ Fastify 5                                                        │ Plugin encapsulation maps cleanly onto "one module =  │
│            │                                                                  │ one plugin"                                           │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Validation │ Zod + fastify-type-provider-zod                                  │ One schema drives request validation (422), response  │
│            │                                                                  │ serialisation, TS types and the LLM's JSON schema     │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ DB         │ Postgres 16 + pgvector, Drizzle ORM, postgres driver,            │ Type-safe SQL. pgvector is there for future           │
│            │ drizzle-kit migrations                                           │ memory/RAG work (off by default)                      │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Jobs       │ p-queue mirrored into a jobs table                               │ Clone, index and refresh work runs in-process with    │
│            │                                                                  │ concurrency 3, a 120 s timeout and retries            │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Streaming  │ fastify-sse-v2 + Node EventEmitter                               │ Live "Run log" of a review                            │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ LLM        │ openai SDK (also used for OpenRouter), @anthropic-ai/sdk         │ Seeded agents default to openrouter /                 │
│            │                                                                  │ deepseek/deepseek-v4-flash (db/seed.ts)               │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ GitHub /   │ octokit, simple-git                                              │ PR import and comments; local shallow clones          │
│ git        │                                                                  │                                                       │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│            │ @ast-grep/napi (symbols), dependency-cruiser (import graph),     │                                                       │
│ Code intel │ graphology (PageRank), js-tiktoken (repo-map token budget),      │ repo-intel pipeline                                   │
│            │ @vscode/ripgrep                                                  │                                                       │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Web        │ Next.js 15 (App Router), React 19, TanStack Query, next-intl,    │ The studio UI                                         │
│            │ Tailwind 4, mermaid, react-markdown, recharts                    │                                                       │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Tests      │ vitest everywhere, testcontainers (real Postgres), React Testing │ See TESTING.md                                        │
│            │  Library + jsdom, agent-browser for e2e                          │                                                       │
├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Infra      │ Docker Compose (Postgres only), GitHub Actions (5 path-filtered  │ Only the DB is containerised; the API and web app run │
│            │ workflows), scripts/dev.sh                                       │  on the host                                          │
└────────────┴──────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────┘

4. How modules communicate

There are five distinct mechanisms. Knowing which one is involved tells you where to debug.

mermaid
flowchart TB
  subgraph c[client]
    Q["TanStack Query hooks"]
    ES["EventSource"]
  end
  subgraph s[server]
    R["routes"] --> SV["services"]
    SV -->|"enqueue(kind,payload)"| JR["JobRunner"]
    JR -->|"handler by kind"| H["clone / index / refresh / resync handlers"]
    SV -->|"publish(runId, kind, msg)"| RB["RunBus"]
    RB -->|"subscribe (replay buffer, then live)"| SSE["GET /runs/:id/events"]
    SV -->|"function call"| ENG["reviewer-core"]
    SV -->|"container.repoIntel.*"| RI["repo-intel facade"]
  end
  Q -- "1. REST JSON" --> R
  ES -- "2. SSE" --> SSE
  Q -. "5. polling every 4s while a run is 'running'" .-> R

1. REST (client → server). apiFetch in client/src/lib/api.ts handles every call. Errors come back as an { error: { code, message, details } } envelope, which the client normalises to ApiError. A global QueryCache/MutationCache in lib/providers.tsx turns errors into toasts.
2. Server-Sent Events (server → client). RunBus (platform/sse.ts) is an in-memory pub/sub keyed by runId with a replay buffer. GET /runs/:id/events (modules/reviews/routes.ts:48) bridges it into an async generator. On the client, useRunEvents in lib/hooks/reviews.ts opens one EventSource per run.
3. Background jobs (module → module, asynchronously). repos doesn't call repo-intel directly. After cloning, it enqueues an INDEX_JOB_KIND job, and the handler for that job was registered by the repo-intel plugin when it loaded (repo-intel/routes.ts). This is the main decoupling seam between modules.
4. The DI container (shared services). Modules reach shared things (agentsRepo, reviewRepo, repoIntel, llm(), github(), git) through app.container rather than importing each other's folders.
5. Direct function calls across packages. The server imports reviewPullRequest from @devdigest/reviewer-core. That isn't an npm dependency: it's a tsconfig path alias straight to ../reviewer-core/src.

There are no WebSockets and no message broker; everything is in-process.

5. Interesting, unusual or confusing aspects

Packaging and code sharing

- No monorepo tooling, but packages still import each other's source. Each package has its own lockfile. server uses pnpm, while reviewer-core and e2e use npm. Sharing works through tsconfig path aliases, and the result is a circular-looking arrangement:
  - server → ../reviewer-core/src
  - reviewer-core → ../server/src/vendor/shared (reviewer-core/tsconfig.json)
  - reviewer-core also pins zod to its own node_modules to avoid two zod instances. That same duplicate-instance problem is why the server's error handler detects ZodError by shape as well as by instanceof (server/src/app.ts).
- The "shared" contracts are vendored twice, and the copies have drifted. client/src/vendor/shared is a copy, not an alias of the server's. Today diff -r shows 5 files differ. The client copy lacks sessionId, the 'openrouter' provider id on LLMProvider, commitFiles/sync/diffNameOnly, and AgentManifest. When you change a contract, update both copies. The client's vendored copy is the one that can go stale.
- CI is path-filtered across packages for the same reason. For example, reviewer-core/** changes trigger server-unit.
- server/package.json is meant to be skip-worktree. TESTING.md says a local variant diverges from the committed file, which is why CI calls pnpm exec vitest run … directly instead of relying on scripts.

Code that exists for later milestones

- The schema contains every table, but most are empty. db/schema.ts defines about 40 tables, including skills, memory, eval, ci, multi-agent and digests. In the starter, only core, repos, pulls, reviews/findings, agents, agent_runs/run_traces, jobs and the repo-intel tables are used.
- The engine has dormant slots. reviewPullRequest accepts skills, memory, specs and a map-reduce strategy, and assemblePrompt silently omits empty sections. Comments refer to a "CI runner" and "agent-runner", and .gitignore has !agent-runner/dist/, but no agent-runner/ exists in this repo. It's slated for M6.

Review runs

- Reviews are fire-and-forget. POST /pulls/:id/review creates the agent_runs rows, starts executeRuns with void, and returns the run IDs immediately (reviews/service.ts:283). The client then subscribes over SSE and polls /pulls/:id/runs every 4 s while anything is running.
- Single API instance assumed. On boot, buildApp reaps every run still marked running, on the reasoning that a fresh process has none of its own. The code comment notes this would break with multiple replicas. RunBus state is in-memory for the same reason.
- Strategy defaults disagree.
  - The engine defaults to 'auto'.
  - The studio constant is 'single-pass' (reviews/constants.ts), with a comment explaining that map-reduce is fragile.
  - The DB column also defaults to single-pass.
  - The agent row wins: agent.strategy ?? REVIEW_STRATEGY.
- Cancellation is cooperative. checkCancelled runs only before each chunk's LLM call. In single-pass mode there's one chunk, so cancel can't interrupt an in-flight LLM call. cancelRun marks the row cancelled right away, but completeAgentRun (repository/run.repo.ts:141) updates without a status guard. My reading is that a run cancelled mid-call could be overwritten back to done when the model returns, with its review persisted. I haven't tested this; it's worth checking.
- The RunBus never frees buffers. complete() deletes the emitter but keeps buffers, seq and completed "briefly", and nothing ever evicts them. For a local tool that's minor, but memory grows per run for the life of the process.

Repo intel

- repo-intel degrades instead of throwing. Every facade method returns [] or a degraded object when the feature is off or the repo isn't indexed yet. An unindexed repo silently falls back to a diff-only review.
- There are two toggles. The global REPO_INTEL_ENABLED and the per-agent agents.repo_intel.
- The index is a background job with a self-imposed time limit. It watches a ~110 s soft budget so it can finish partial before JobRunner's 120 s hard timeout. Because clones are shallow (depth 1), "hotness" (git churn) is fixed at 0 and rank is pure PageRank.
- The diff has a fallback. loadDiff prefers a real git diff base...head from the clone. If that fails, it rebuilds a synthetic unified diff from the persisted pr_files.patch rows. That's why the seeded demo PR can be reviewed without any clone.

Security, tenancy and secrets

- Security posture of an unauthenticated local API. It binds to loopback, has an onRequest Host/Origin allowlist against DNS rebinding (platform/local-only.ts), and the Next config sets a CSP with a restricted connect-src/img-src, because LLM output and PR text are rendered as markdown.
- Tenancy is plumbed through but fake. getContext() is called by every route and returns workspace IDs. LocalNoAuthProvider always returns the seeded default workspace and you@local user. If those aren't seeded, every request fails with "run pnpm db:seed".
- Secrets never touch the DB or AppConfig. They live in ~/.devdigest/secrets.json (mode 0600), with process.env as a fallback, and are read only via SecretsProvider. "Test connection" checks a candidate key with a throwaway client before saving it.
- The pulls GET has side effects. GET /repos/:id/pulls syncs from GitHub, upserts PRs, and backfills diff stats for up to 10 PRs before returning. If no token is set, it serves the persisted rows.

Docs vs. code

- The top-level README says "two built-in reviewers (General + Security)", but db/seed.ts seeds three: General, Security and Performance.

6. Conventional parts (these should feel familiar)

- A standard Fastify layered module: routes → service → repository, with AppError subclasses mapped to HTTP status in one error handler.
- Drizzle schema split by domain, with a barrel schema.ts, generated SQL migrations in db/migrations, and an idempotent seed.ts. Migrations are not run on boot.
- A Zod-validated env config (platform/config.ts).
- Constructor/getter-based dependency injection with test overrides (ContainerOverrides) and mocks in adapters/mocks.ts.
- Next.js App Router with thin pages, colocated _components/<Name>/ folders each with a *.test.tsx, a TanStack Query hook layer, and next-intl message JSON.
- Testing that splits hermetic unit tests from *.it.test.ts integration tests (testcontainers), with one GitHub workflow per package.
- /health (liveness) and /health/ready (DB ping, returning 503) endpoints, plus graceful SIGTERM/SIGINT shutdown.

7. Key workflows

A. Add a repo, then clone and index it

mermaid
sequenceDiagram
  participant UI as client /onboarding
  participant R as repos module
  participant J as JobRunner
  participant G as GitClient (simple-git)
  participant RI as repo-intel pipeline
  participant DB as Postgres
  UI->>R: POST /repos {url}
  R->>DB: insert repos row (dedupe by full_name)
  R->>J: enqueue 'clone' {repoId, owner, name}
  R-->>UI: 201 Repo
  J->>G: clone (depth 1, URL rebuilt from owner/name)
  G-->>J: path → repos.clone_path
  J->>J: enqueue INDEX job
  J->>RI: runFullIndex: walk → ast-grep → dep-cruiser → PageRank → repo map
  RI->>DB: symbols, references, file_edges, file_rank, repo_map_cache, repo_index_state
  UI->>R: GET /repos/:id/index-state (polled → "Indexed" badge)

Key files: modules/repos/service.ts, platform/jobs.ts, modules/repo-intel/pipeline/full.ts.

B. Import and list PRs

GET /repos/:id/pulls (modules/pulls/routes.ts) does the following in one call:

1. Lists PRs through Octokit.
2. Upserts each PR on (repo_id, number).
3. Backfills diff stats.
4. Attaches the latest review score.
5. Derives status (reviewed, needs-review or stale) by comparing last_reviewed_sha with head_sha (pulls/status.ts).

POST /repos/:id/poll is the explicit "sync only" variant. GET /pulls/:id returns detail: files, commits, body and linked issue.

C. Run a review (the core flow)

mermaid
sequenceDiagram
  participant UI as PR detail (RunReviewDropdown)
  participant RT as reviews/routes.ts
  participant SV as ReviewService
  participant EX as ReviewRunExecutor
  participant RI as repoIntel facade
  participant ENG as reviewer-core
  participant LLM as LLM provider
  participant BUS as RunBus
  participant DB as Postgres

  UI->>RT: POST /pulls/:id/review {agentId | all:true}
  RT->>SV: resolveTargets → runReview
  SV->>DB: insert agent_runs (status=running) per agent
  SV--)EX: executeRuns(...) — NOT awaited
  SV-->>UI: { runs: [{run_id,...}] }
  UI->>RT: GET /runs/:id/events (EventSource)
  EX->>BUS: "Loading PR diff" (shared pre-work, fanned out to all runs)
  EX->>EX: loadDiff (git diff, else pr_files)
  loop per agent (sequential, failures isolated)
    EX->>DB: container.llm(provider) via secrets
    EX->>RI: getCallerSignatures / getRepoMap / getFileRank (best-effort)
    EX->>ENG: reviewPullRequest({systemPrompt, diff, repoMap, callers, prDescription, task, llm, checkCancelled, onEvent})
    ENG->>ENG: assemblePrompt (+INJECTION_GUARD, <untrusted> wrapping)
    ENG->>LLM: completeStructured(schema=Review) with parse-and-repair retries
    ENG->>ENG: reduceReviews → groundFindings → scoreFromFindings
    ENG-->>EX: grounded Review + assembly + tokens
    EX->>DB: insert reviews + findings, mark PR reviewed at head_sha
    EX->>DB: complete agent_runs + save ONE run_traces doc (full event log)
    EX->>BUS: complete(runId) → SSE stream ends
  end
  UI->>RT: refetch /pulls/:id/reviews, /pulls/:id/runs

Notes for debugging:

- A run fails with no visible error. Look in agent_runs.error and the run_traces.trace.log document. Both are persisted on failure, so they survive a reload.
- The prompt looks wrong. GET /runs/:id/trace returns the exact prompt_assembly that was sent, and the UI shows it in RunTraceDrawer.
- Findings vanished. That's the grounding gate. Dropped findings appear as info events (grounding dropped "…") in the run log, and as the N/M passed figure.

D. Act on findings, manage agents, and settings

- POST /findings/:id/accept|dismiss updates the finding's state (reviews/findings.ts).
- Agents CRUD lives at /agents. Every config change bumps version and writes an agent_versions row. GET /providers/:id/models lists models dynamically from the provider.
- Settings: POST /settings/test-connection {provider, key} verifies a key, saves it to the secrets file, and calls container.invalidateSecretCaches() so the next LLM/GitHub client picks it up.

8. Project structure

dev-digest/
├── scripts/dev.sh             ← one-command boot (Docker PG → env → install → migrate → seed → API+web)
├── docker-compose.yml         ← Postgres only (pgvector/pg16, loopback :5432)
├── TESTING.md                 ← test philosophy + suite map (read this before adding tests)
├── docs/agent-prompts/        ← reference system prompts for reviewer agents
├── .github/workflows/         ← one path-filtered workflow per suite
├── .claude/skills/            ← Claude Code skills for this repo (not app code)
│
├── server/                    @devdigest/api
│   └── src/
│       ├── server.ts          ← entrypoint (listen + graceful shutdown)
│       ├── app.ts             ★ buildApp: guards, plugins, error handler, stale-run reaper, module registration
│       ├── modules/index.ts   ★ static module registry — add new modules here
│       ├── modules/
│       │   ├── reviews/       ★ service.ts (entry) · run-executor.ts (the run) · diff-loader.ts · repository/
│       │   ├── repo-intel/    ★ service.ts (facade) · pipeline/{full,incremental,rank,repo-map,walk}.ts
│       │   ├── repos/         add/clone/refresh
│       │   ├── pulls/         GitHub PR import, detail, comments, status derivation
│       │   ├── agents/        CRUD + versions + model listing
│       │   ├── settings/      prefs + key test/save
│       │   ├── polling/ workspace/
│       │   └── _shared/       getContext (tenancy), IdParams
│       ├── platform/          ★ container.ts (DI) · config.ts · sse.ts (RunBus) · jobs.ts · errors.ts · local-only.ts
│       ├── adapters/          llm/ github/ git/ astgrep/ depgraph/ tokenizer/ secrets/ auth/ · mocks.ts
│       ├── db/                schema/ (by domain) · migrations/ · seed.ts · migrate.ts
│       └── vendor/shared/     ★ @devdigest/shared — canonical Zod contracts
│   └── test/                  *.test.ts (hermetic) · *.it.test.ts (testcontainers)
│
├── reviewer-core/             @devdigest/reviewer-core (source-only, never built to JS)
│   └── src/
│       ├── review/run.ts      ★ reviewPullRequest — the engine entry point
│       ├── prompt.ts          ★ assemblePrompt + INJECTION_GUARD
│       ├── grounding.ts       ★ the citation gate
│       ├── llm/               openrouter.ts (provider) · structured.ts (Zod→JSON Schema, parse-and-repair)
│       ├── review/reduce.ts   merge partials, scoreFromFindings
│       └── output/to-review.ts  GitHub-review payload + countBlockers (CI gating)
│
├── client/                    @devdigest/web
│   ├── messages/en/*.json     i18n strings (many for not-yet-built features)
│   └── src/
│       ├── app/               routes: / · onboarding · repos/[repoId]/pulls[/number] · agents[/id] · settings/[section]
│       │   └── repos/[repoId]/pulls/[number]/_components/  ★ PR detail: RunReviewDropdown, FindingsPanel, RunTraceDrawer, DiffTab …
│       ├── lib/api.ts         ★ the single fetch client
│       ├── lib/hooks/         ★ reviews.ts (incl. useRunEvents SSE), agents.ts, core.ts, repo-intel.ts, trace.ts
│       ├── lib/providers.tsx  QueryClient + global error toasts
│       ├── components/        app-shell, diff-viewer, page-shell …
│       └── vendor/{ui,shared} vendored design system + a COPY of the shared contracts (has drifted)
│
└── e2e/                       run.ts + specs/NN-*.flow.json (agent-browser, seeded data, no LLM)

Where to look when you need to…

┌───────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│             Task              │                                               Start here                                               │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Change what the model sees    │ reviewer-core/src/prompt.ts, then the context building in run-executor.ts                              │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Debug "why was this finding   │ reviewer-core/src/grounding.ts + the run trace log                                                     │
│ dropped?"                     │                                                                                                        │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Add an API endpoint or        │ New server/src/modules/<name>/routes.ts + register it in modules/index.ts + a contract in              │
│ feature                       │ vendor/shared (and the client copy)                                                                    │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Add an LLM provider           │ adapters/llm/* + Container.buildLlm + the Provider enum in shared + agents.provider enum + a migration │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Debug a stuck "running"       │ agent_runs table, RunBus (platform/sse.ts), the reaper in app.ts                                       │
│ review                        │                                                                                                        │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Debug the "Indexed" badge     │ repo_index_state, the jobs table (status/error), repo-intel/pipeline/full.ts                           │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Change a UI screen            │ client/src/app/<route>/_components/<Name>/ and its hook in lib/hooks/                                  │
└───────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Assumptions and things I didn't verify

- I read code but didn't run the app or the tests.
- The cancellation race and the RunBus memory growth come from reading the code and should be confirmed with a test.
- I skimmed rather than fully read pipeline/incremental.ts, pulls/routes.ts (comments endpoints), agents/routes.ts, the Anthropic/OpenAI adapters and most client components. The descriptions of those come from their headers and call sites.