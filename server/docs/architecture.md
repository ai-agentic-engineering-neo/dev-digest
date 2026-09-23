# Server architecture — DI, adapters, boot

How the API is wired **today**: boot order, the container, test overrides, modules,
errors, secrets and jobs. [`../README.md`](../README.md#request--di-flow) has the
request/DI diagram, API map, env table and rate limits; [`../CLAUDE.md`](../CLAUDE.md)
has the conventions. The review run is specified in
[`../specs/review-flow.md`](../specs/review-flow.md). Paths are relative to `server/`.

## Boot sequence

1. `src/server.ts:6-7` — `loadConfig()` then `buildApp({ config })`, then it listens on
   `0.0.0.0:API_PORT` (`:29`). SIGTERM/SIGINT run `app.close()` once (`:12-26`).
2. `loadConfig` (`src/platform/config.ts:64-81`) imports `dotenv/config` (`:1`) and
   zod-parses env (`:15-39`). API keys are **not** in `AppConfig` (`:9-13`). The
   secrets path is fixed to `~/.devdigest/secrets.json`, not an env var (`:74`).
3. `buildApp` (`src/app.ts:41-176`), in this order:
   - DB via `createDb` unless `opts.db` is passed (`:42-44`); Fastify with a 1 MiB
     `bodyLimit` (`:49`); zod compilers (`:64-65`); `new Container(config, db, overrides)`
     decorated as `app.container` (`:67-68`).
   - **Reaper**, awaited before any plugin: every `agent_runs` row still `running`
     becomes `failed`, with no error text or duration (`:80-85`,
     `src/modules/reviews/repository/run.repo.ts:105-112`). If it throws, boot only
     logs a warning. It assumes one API instance per DB (`:78-79`).
   - helmet; cors with `origin: http://localhost:${WEB_PORT}`; the SSE plugin (`:89-91`).
     The global rate limit is **not registered** under `NODE_ENV=test` (`:95-97`),
     so per-route `config.rateLimit` caps do nothing in tests.
   - `/health` and `/health/ready` (503 when the DB ping fails, `:100-112`), the error
     handler (`:116-164`), the modules (`:168-170`), and an `onClose` that closes the
     pool only if `buildApp` created it (`:173`).

The reaper runs on **every** `buildApp`, tests included. `test/routes-smoke.test.ts:15`
builds without a `db`, so it reaps the DB in `DATABASE_URL` (the dev DB under
`server/.env`). A second app built while a run of the first is in flight marks that run
`failed` until the first app's executor writes its final status over it.

## The container (`src/platform/container.ts`)

One per app. Services receive the container and read adapters from it.

| Member | Built | Override |
| ------ | ----- | -------- |
| `config`, `db` | passed in by `buildApp` | `buildApp({ config, db })` |
| `secrets` | eager: `LocalSecretsProvider(config.secretsPath)` (`:83`) | `secrets` |
| `auth` | eager: `LocalNoAuthProvider(db)` (`:84`) | `auth` |
| `runBus` | the module singleton (`:85`, `src/platform/sse.ts:103`) | — |
| `jobs` | eager: `new JobRunner(db)` (`:86`) | — |
| `git`, `codeIndex` | lazy getters (`:89-93`, `:103-107`) | `git`, `codeIndex` |
| `agentsRepo`, `reviewRepo` | lazy getters (`:95-101`) | — |
| `repoIntel`, `depgraph`, `tokenizer` | lazy getters (`:114-132`) | same names |
| `priceBook` | lazy; lists OpenRouter models if a key exists, else `[]` (`:140-151`) | — |
| `github()` | async, cached; `ConfigError` without `GITHUB_TOKEN` (`:153-160`) | `github` |
| `llm(id)` | async, cached **per id** (`:163-171`) | `llm[id]` |
| `embedder()` | async; `ConfigError` unless `EMBEDDINGS_ENABLED=true` (`:195-208`) | `embedder` |

- `llm('openai' | 'anthropic')` builds `src/adapters/llm/openai.ts` / `anthropic.ts`.
  `llm('openrouter')` builds reviewer-core's `OpenRouterProvider` with
  `priceBook.estimate` injected as its cost fallback (`:173-193`).
- The overridable set is `ContainerOverrides` (`:40-54`). You cannot override
  `priceBook`, the repositories, `jobs` or `runBus`. Getters check the override
  before the cache, so an override always wins (`:90`, `:154`, `:164-165`, `:200`).
- `runBus` is the module-level instance, shared by every app in one process (tests too).
- `invalidateSecretCaches()` drops the cached LLM clients, the GitHub client and the
  embedder (`:214-218`). Its only caller is `POST /settings/test-connection`, right
  after it saves a key (`src/modules/settings/routes.ts:79-85`).
- Most interfaces come from `@devdigest/shared` (`:1-9`, `src/vendor/shared/adapters.ts:10-12`).
  Exceptions: `DepGraph` and `Tokenizer` live in their adapter files
  (`src/adapters/depgraph/index.ts:27`, `src/adapters/tokenizer/index.ts:16`), and
  `RepoIntel` in `src/modules/repo-intel/types.ts:137`. repo-intel imports ast-grep
  directly and never gets it from the container (`src/modules/repo-intel/pipeline/full.ts:29`).

## How tests swap adapters

- Pass `buildApp({ config, db, overrides })` (`src/app.ts:28-32`). Examples: `appWith`
  and `appWithLlm` in `test/reviews.it.test.ts:113-125`, `:217-228`.
- `src/adapters/mocks.ts`:
  - `MockLLMProvider` parses its fixture with the request's schema and **throws** on
    a mismatch (`:89-95`). A `{}` fixture is how tests produce a failed run
    (`test/reviews.it.test.ts:291-293`). Every call reports 100/50 tokens and $0.001
    (`:78-86`, `:96-104`). `structuredBySchema` picks a fixture per `schemaName` (`:53`, `:91`).
  - `MockGitClient` returns a default one-file diff (`:281-286`); `MockGitHubClient`
    records what it posts (`:130-135`). `MockSecretsProvider` has no `set()` (`:325-330`),
    so saving a key returns "Secrets backend is read-only" (`src/modules/settings/routes.ts:80-81`).
- Anything you do not override is the real adapter. No test overrides `secrets` or
  `auth`, so DB suites use the seeded workspace and read the developer's own
  `~/.devdigest/secrets.json`. The test "run all enabled agents reviews with each
  enabled agent" (`test/reviews.it.test.ts:495-504`) also runs the seeded OpenRouter
  agents (`src/db/seed.ts:12`, `:185-188`), and nothing overrides `openrouter`. If the
  machine has an OpenRouter key, those background runs call the real API.

## Modules and request context

- The registry is static: `settings, repos, pulls, polling, workspace, agents, reviews,
  repoIntel` (`src/modules/index.ts:24-33`); `:15-18` says why there is no autoload.
  `@fastify/autoload` is still a dependency (`package.json:19`) that nothing imports.
- Each module is a plain async plugin registered with `await` (`src/app.ts:168-170`), so
  it is encapsulated and inherits `app.container` and the root error handler. Seven of
  the eight call `withTypeProvider<ZodTypeProvider>()` (e.g. `src/modules/reviews/routes.ts:20`).
  `workspace` declares no schema at all (`src/modules/workspace/routes.ts:13`).
- Job handlers are registered when their module registers (`src/modules/repos/routes.ts:24`,
  `src/modules/repo-intel/routes.ts:30`). No route declares a `response` schema, so the
  response-serialization branch (`src/app.ts:130-134`) never fires.
- `getContext` resolves the user and the workspace (`src/modules/_shared/context.ts:14-23`).
  `LocalNoAuthProvider` looks up the seeded `you@local` / `default` (`src/db/seed.ts:28-29`)
  once and caches them for the process lifetime (`src/adapters/auth/local.ts:15-37`): after a
  DB reset and reseed, a running API keeps the old workspace id. A missing seed throws a
  plain `Error` (`:23`, `:34`) → 500. `IdParams` requires a uuid
  (`src/modules/_shared/schemas.ts:11`), so a bad `:id` is a 422 before the handler.

## Error model

Classes are in `src/platform/errors.ts`. Every mapped body is `{ error: { code, message, details } }`.

| Thrown | Status · `code` | Where |
| ------ | --------------- | ----- |
| route schema failure | 422 · `validation_error` (`details` = issues) | `src/app.ts:118-127` |
| `ZodError` from a hand `.parse` (`instanceof`, or `name` + `issues` shape) | 422 · `validation_error` | `src/app.ts:135-152` |
| `AppError` (default 400), `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError` | own status: 400, 404, 422, 502, 500 | `src/app.ts:153-158`, `src/platform/errors.ts:7-41` |
| anything else | `err.statusCode ?? 500` · `internal_error`, with the raw `message` | `src/app.ts:159-163` |
| unknown route | Fastify's default 404 body (there is no `setNotFoundHandler`) | — |

- The duck-typed Zod branch is still needed because `POST /pulls/:id/review`
  hand-parses its body with `RunRequest.parse` (`src/modules/reviews/routes.ts:32`).
- Framework errors land in "anything else": a 429 from `@fastify/rate-limit`, a 413 for a body
  over 1 MiB and a 400 for malformed JSON keep their status but carry `internal_error`.

## Secrets read path (`src/adapters/secrets/local.ts`)

- The file is read once, on first use, and cached. A missing or corrupt file counts as `{}` (`:24-35`).
- `get` returns a non-empty stored value first (`:38-39`). Otherwise `GITHUB_TOKEN` falls
  back to env `GITHUB_TOKEN`, then env `GITHUB_PAT` (`:40`), and every other key reads env (`:41`).
- `set` updates the cache and rewrites the whole file with mode `0600` (`:44-49`). Node
  applies that mode only when it creates the file. A key saved in the UI works at once
  (with `invalidateSecretCaches()`); a hand edit of the file or env needs a restart.
- A missing key makes the container getters throw `ConfigError`, which is a 500 `config_error`
  (`src/platform/container.ts:157`, `:176`, `:184`, `:191`). Inside a review it fails the run instead.

## JobRunner (`src/platform/jobs.ts`)

- p-queue: concurrency 3, a 120 s timeout, 2 retries (`:40-42`). Each job has a `jobs` row that
  goes `queued` → `running` → `done`/`failed` (`:53-95`). An unknown kind throws (`:50-51`).
- Only 429, 5xx and network errors are retried (`src/platform/resilience.ts:35-44`). A
  `TimeoutError` is not. `withTimeout` does not stop the handler, which keeps running after
  its row says `failed` (`src/platform/resilience.ts:13-23`).
- Users: clone (`src/modules/repos/service.ts:46`) and index/refresh/resync
  (`src/modules/repo-intel/service.ts:173-181`). The queue lives in memory; nothing reaps
  or resumes `jobs` rows on boot. Tests wait with `app.container.jobs.onIdle()`
  (`test/integration.it.test.ts:105`).
- **Reviews do not use it.** They are fire-and-forget (`src/modules/reviews/service.ts:133`);
  see [`../specs/review-flow.md`](../specs/review-flow.md).

## Adding an adapter

1. Interface in `src/vendor/shared/adapters.ts` (a contract change: mirror it in
   `../client/src/vendor/shared/adapters.ts`); implementation in `src/adapters/<name>/`,
   exported from `src/adapters/index.ts`.
2. A private field and a lazy getter in the container. Make it async if it needs a secret,
   throw `ConfigError` when the secret is missing, and clear it in `invalidateSecretCaches()`.
3. A `ContainerOverrides` key, checked first in the getter, and a deterministic mock in
   `src/adapters/mocks.ts` that tests inject through `overrides`.
4. Services use it only as `container.<name>`; they never import the class.
