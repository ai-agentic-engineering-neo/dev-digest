# System architecture

Companion to the diagram in [../README.md](../README.md). This file covers the *relations* between packages; per-package internals live in each package's `docs/`.

## Topology

Everything runs on the developer's machine. Postgres is the only container.

```
browser ──► client (Next.js :3000) ──REST/SSE──► server (Fastify :3001) ──► Postgres+pgvector
                                                    │
                                                    ├─► reviewer-core (in-process, source import)
                                                    ├─► GitHub REST (Octokit)   ← only outbound calls,
                                                    └─► LLM (OpenAI/Anthropic/OpenRouter) ← with the LLM
```

## Package dependency direction

```
@devdigest/shared  ◄── server ──► reviewer-core ──► @devdigest/shared
        ▲                 │
        └──── client ─────┘   (client also depends on @devdigest/ui)
```

- `reviewer-core` depends on `shared` only. It must never import from `server` or `client`.
- `server` depends on `shared` + `reviewer-core`.
- `client` depends on `shared` + `ui`. It never imports server code; the API is the only contract.
- Resolution is via tsconfig `paths` to source files — there is no build step between packages.

## The review flow, end to end

1. **Add repo** (`POST /repos`) → a `clone` job is enqueued on the server's job runner → `SimpleGitClient` clones into `DEVDIGEST_CLONE_DIR`.
2. **Index** — the clone job chains an `index` job; `repo-intel` extracts symbols/references (ast-grep), builds the import graph (dependency-cruiser), computes a PageRank-based file rank, and caches a token-budgeted repo map. Drives the **Indexed** badge.
3. **Import PRs** (`GET /repos/:id/pulls`, `POST /repos/:id/poll`) → Octokit lists PRs; `GET /pulls/:id` pulls diff, files, commits, body, linked issue. Import is idempotent on `(repo_id, number)`.
4. **Run review** (`POST /pulls/:id/review`) → one `agent_runs` row per target agent is created **synchronously** so run IDs come back immediately; execution is backgrounded.
5. **Enrich + call** — the server resolves context (repo map, caller signatures, blast-rank note) and hands it to `reviewer-core.reviewPullRequest`, which assembles the prompt, calls the injected LLM with a structured-output schema, and applies the grounding gate.
6. **Persist + stream** — findings, review, run stats, and one `run_traces` jsonb document are written; progress streams live over SSE at `/runs/:id/events`.

Invariants that must hold across all of this: [../specs/review-flow.md](../specs/review-flow.md).

## Separation of concerns

| Concern | Owner |
|---------|-------|
| HTTP, persistence, jobs, secrets, streaming, observability | `server` |
| Prompt assembly, injection guard, structured output, grounding, scoring | `reviewer-core` |
| Static code facts about a repo (symbols, imports, rank, repo map) | `repo-intel` (inside `server`, read through one facade) |
| Rendering, data fetching/caching, error UX | `client` |
| Type-level agreement between all of the above | `@devdigest/shared` |

The engine is pure so the same code can run a review in the studio and (from lesson L06) in CI. The server owns every side effect.

## Extension model

The starter is deliberately a subset. The DB schema, shared contracts, engine prompt slots (`skills`, `memory`, `specs`), `repo-intel` facade methods, and client i18n namespaces already exist for features added lesson by lesson. A lesson typically adds:

1. a self-contained `server/src/modules/<name>/` plugin registered in `modules/index.ts`,
2. a prompt slot it starts feeding to `reviewer-core`,
3. a client route/hook pair,

without modifying other modules or the schema.
