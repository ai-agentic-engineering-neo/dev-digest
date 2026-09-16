# e2e — flow authoring

Deeper reference for the flow format summarized in [`../CLAUDE.md`](../CLAUDE.md)
and specified in [`../README.md`](../README.md#how-a-flow-works).

## Anatomy of a flow

```jsonc
{
  "name": "human-readable description",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "…" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "…" },
    { "cmd": ["wait", "--text", "#482"], "label": "…", "assert": { "stdoutIncludes": "…" } }
  ]
}
```

- `{BASE}` is substituted with `E2E_BASE_URL` before any command runs.
- `run.ts` executes `steps` **in order** against one shared browser session —
  a flow is not a set of independent cases, so a later step can rely on state
  a prior step created (e.g. being on a given page).
- Each `cmd` array is passed verbatim as `agent-browser <cmd...>`. A non-zero
  exit fails the step and aborts the rest of the flow.
- `wait --url <pattern>` / `wait --text <substring>` block until true or
  timeout (`E2E_STEP_TIMEOUT`, default 60000ms) — they double as the
  assertion, there's no separate "expect" primitive.
- `find role|text|label` locates an element deterministically; there's no
  CSS-selector or XPath escape hatch by design — it keeps flows resilient to
  markup changes that don't change user-visible structure.
- Optional `assert.stdoutIncludes` adds a substring check on that command's
  stdout, for cases `wait` can't express (e.g. a count).

## What flows must NOT do

- Never use the AI `chat` command — it would make runs non-deterministic and
  require a key, defeating the point of this suite vs. an LLM-driven review.
- Never depend on data beyond the seed (`acme/payments-api`, PR #482, the two
  built-in agents) — a flow that needs more data belongs in a later lesson's
  suite, not here.

## Hermetic stack topology

`../scripts/e2e.sh` boots an isolated stack on alternate ports so it can run
alongside your normal dev stack without touching it:

| Component | Alt port/name | Env var |
|---|---|---|
| Postgres | `5433` | `E2E_PG_PORT` |
| API | `3101` | `E2E_API_PORT` |
| Web | `3100` | `E2E_WEB_PORT` |
| Container name | `devdigest-e2e-postgres` | `E2E_PG_CONTAINER` |

The isolated Postgres has **no persistent volume** — it's empty every run,
which is exactly what flows 02/04/05 require (see
[`../CLAUDE.md`](../CLAUDE.md)'s Gotchas).

## Debugging a failing flow

Failure screenshots land in `e2e/test-results/` (git-ignored locally,
uploaded as an artifact by `e2e-web.yml` in CI) — check there before
re-running blind.
