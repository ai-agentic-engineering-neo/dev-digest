# Prompt-assembly logging

One structured pino line, `event: "prompt.assembled"`, for every prompt sent to a model:
each reviewer agent's prompt (one per chunk in map-reduce) and the intent classifier's.

## What a line carries

| Field | Meaning |
|---|---|
| `purpose` | `review` or `intent` |
| `correlationId` | One per review click, shared by the intent derivation and every agent's prompt; for **Derive** it is the Fastify request id |
| `prId`, `runId`, `agent` | `runId` / `agent` only on review prompts |
| `provider`, `model`, `strategy`, `chunk` | `chunk` is `index/count` |
| `sections[]` | `name`, `source`, `wrapped` (inside `<untrusted>`), `chars`, `approxTokens` |
| `totalChars`, `approxTokens` | `approxTokens = ceil(chars / 4)`; the exact count is the run's `tokensIn` |

Never logged: section text, the diff, PR title/body, linked docs, issue text, keys.
`wrapped: false` on `task` is expected — the task line quotes the PR title unwrapped.

## Modes (`PROMPT_LOG`)

- `summary` (default) — the fields above; no names or paths beyond agent and model.
- `verbose` — adds `chunkLabel`, per-item `items` sizes, `details` labels (skill names,
  diff file paths, linked-doc paths, `#N` issues) and an FNV-1a `fingerprint` per section.
  Honoured **only with `NODE_ENV=development`**; anywhere else it falls back to `summary`
  with a boot warning, because a fingerprint of a short text confirms a guess at it.
- `off` — nothing.

Local use: `PROMPT_LOG=verbose` in `server/.env`, restart the API, run a review, then
filter the log by `correlationId`.

## Where it is built

`reviewer-core` `assemblePrompt` returns `sections` (metadata only) and
`reviewPullRequest` hands them to `onPromptAssembled`; the intent module builds its own
in `render.ts`. Both are written by `src/platform/prompt-log.ts`.
