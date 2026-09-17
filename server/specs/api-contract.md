# Spec — HTTP contract

What callers can rely on. Payload shapes are defined by the Zod contracts in `src/vendor/shared/` and are intentionally not repeated here.

## Conventions

- Base URL is `http://localhost:<API_PORT>` (default 3001). CORS allows exactly one origin: the web app at `WEB_PORT`.
- JSON only. Request bodies are capped at 1 MB.
- Every route is scoped to the caller workspace, resolved server-side. An id from another workspace behaves as **not found**.
- Errors always use one envelope: an `error` object with `code`, `message` and optional `details`.
- Status codes: `200` ok, `201` created, `204` no content, `400` malformed request, `404` unknown id, `409` conflict, `422` schema validation failure, `500` internal, `503` not ready.
- Rate limit: 120 req/min globally, tighter on expensive routes such as running a review, disabled under `NODE_ENV=test`. Health and SSE routes are exempt.

## Health

| Method | Path | Contract |
|---|---|---|
| GET | `/health` | liveness, no DB touch |
| GET | `/health/ready` | `SELECT 1` against Postgres, `200` ready or `503` not ready |

## Repos and pull requests

| Method | Path | Contract |
|---|---|---|
| POST | `/repos` | add by URL, enqueues clone + index. Idempotent per workspace: an existing repo returns 200, a new one 201 |
| GET | `/repos` | repos in the workspace |
| POST | `/repos/:id/refresh` | enqueue a re-clone plus an incremental re-index |
| DELETE | `/repos/:id` | remove the repo, cascading its PRs and reviews |
| POST | `/repos/:id/poll` | sync the PR list from GitHub. **Never** triggers a review |
| GET | `/repos/:id/pulls` | PR list. Import is idempotent on repo id + PR number |
| GET | `/pulls/:id` | PR detail: diff and files, commits, body, linked issue |
| GET, POST | `/pulls/:id/comments` | PR review comments |

## Review and runs

| Method | Path | Contract |
|---|---|---|
| POST | `/pulls/:id/review` | body selects one agent or all enabled agents. Returns run ids **immediately**, the review runs in the background. Neither selector supplied gives 400 |
| GET | `/pulls/:id/reviews` | persisted reviews with findings, newest first |
| DELETE | `/reviews/:id` | delete a review and its findings |
| GET | `/pulls/:id/runs` | full run history, any status |
| GET | `/pulls/:id/runs/active` | runs currently running, server-side truth that survives a reload |
| GET | `/runs/:id/events` | **SSE** stream of run events, exempt from rate limiting, ends on completion |
| GET | `/runs/:id/trace` | the single persisted run trace document |
| POST | `/runs/:id/cancel` | idempotent, works for orphaned runs too |
| DELETE | `/runs/:id` | remove a run and its trace |
| POST | `/findings/:id/accept`, `/findings/:id/dismiss` | record an action on a finding |

Run status values: `running`, `done`, `failed`, `cancelled`. A failed row carries `error`; `score` and `blockers` are null unless the run finished.

## Agents

| Method | Path | Contract |
|---|---|---|
| GET, POST | `/agents` | list, create |
| GET, PUT, DELETE | `/agents/:id` | read, update (versioned), delete |
| GET | `/agents/:id/versions` | version history |
| GET, POST | `/agents/:id/skills` | skill attachments, the surface lesson L02 builds on |
| GET | `/agents/:id/models`, `/providers/:id/models` | selectable models, degrades to an empty list when no key is configured |

## Repo intelligence

| Method | Path | Contract |
|---|---|---|
| GET | `/repos/:id/index-state` | index status, drives the **Indexed** badge |
| POST | `/repos/:id/resync` | enqueue a re-index |

An unindexed repo is a valid state, not an error: reviews still run, with less context.

## Platform

| Method | Path | Contract |
|---|---|---|
| GET, PUT | `/settings` | non-secret preferences |
| GET | `/settings/secrets-status` | which keys are present. **Never** returns key material |
| POST | `/settings/test-connection` | validate a provider key and, when one is supplied, persist it through `SecretsProvider` and invalidate cached provider clients. Rate-limited to 20/min |
| GET | `/workspace` | the current single local workspace |
