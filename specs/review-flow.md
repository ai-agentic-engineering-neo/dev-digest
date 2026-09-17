# Spec — review flow invariants

Cross-package rules that any change must preserve. Each is observable and testable; the source of truth is the code referenced.

## Grounding

- **G1** A finding is persisted only if its `[start_line, end_line]` intersects a real hunk of the diff for the same `file`. Otherwise it is dropped. — `reviewer-core/src/grounding.ts`
- **G2** Full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) ground on the file being present in the diff, not on a hunk.
- **G3** Dropped findings are returned with reasons and recorded in the run trace — the pipeline never drops silently.

## Scoring and verdict

- **S1** The persisted score is recomputed from the **surviving** findings; the model's self-reported score is discarded. — `reviewer-core/src/review/reduce.ts`
- **S2** Penalties from 100: `CRITICAL` −35, `WARNING` −12, `SUGGESTION` −3; clamped to 0–100. Zero findings ⇒ 100.
- **S3** In map-reduce, the worst verdict wins (`request_changes` > `comment` > `approve`).
- **S4** `blockers` on a run counts findings at or above the agent's `ciFailOn` severity — a deterministic number, not the model's verdict.

## Prompt safety

- **P1** Every review path appends the single shared `INJECTION_GUARD` to the agent's system prompt. There is no keyword scanning of untrusted text.
- **P2** All untrusted content (diff, PR description, repo map, callers) is delimiter-wrapped by `wrapUntrusted`; PR descriptions are truncated.
- **P3** Claims inside untrusted content that a finding is "intentional / a test fixture / not for production" never reduce severity or scope.

## Context enrichment

- **C1** `repo-intel` is read-only at review time; no indexing happens during a request.
- **C2** With repo-intel globally off (`REPO_INTEL_ENABLED=false`) **or** off for the agent (`repo_intel`), the prompt is byte-identical to the diff-only baseline.
- **C3** An unindexed or partially indexed repo degrades silently — the facade returns empty results and the corresponding prompt sections are omitted.

## Run lifecycle

- **R1** `POST /pulls/:id/review` returns run IDs before any LLM call; execution is backgrounded.
- **R2** `agent_runs.status` ∈ `running` · `done` · `failed` · `cancelled`.
- **R3** A failed or cancelled run still persists its status, error text, and buffered log, so the UI can explain the failure after a reload.
- **R4** One agent's failure never aborts the other agents queued in the same request.
- **R5** Pre-work failure (e.g. diff load) fails every run queued in that request.
- **R6** Runs left `running` by a dead process are reaped on boot, before the server accepts requests. Assumes a single API instance per database.
- **R7** Cancellation both signals the live runner and marks the row, so orphaned runs are cancellable too.
- **R8** Each completed run writes exactly one `run_traces` document containing config, stats, prompt assembly, tool calls, raw output, and the full event log.

## Secrets

- **K1** Secrets are read through `SecretsProvider` only — `~/.devdigest/secrets.json` (mode `0600`) with `process.env` as fallback. Never the database, never git.
- **K2** `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is accepted as a fallback.
- **K3** The app boots and serves with no keys configured; a missing key fails only the run that needs it.
- **K4** With `EMBEDDINGS_ENABLED=false` (default) the process makes zero OpenAI embedding calls — the guard throws before any client is constructed.
