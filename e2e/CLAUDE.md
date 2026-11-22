# CLAUDE.md — `@devdigest/e2e`

> **Load this file when** you are writing or debugging browser e2e flows, adding new flow specs, or troubleshooting CI `e2e-web` failures. Skip it for all other tasks — this package has no shared code with the rest of the repo.
>
> For non-obvious decisions about the test setup and known gotchas, read [`insights.md`](./insights.md). For deeper notes, check [`docs/`](./docs/). Existing flow specs live in [`specs/`](./specs/).

This file provides guidance to Claude Code when working inside `e2e/`.

## Package role

Deterministic browser end-to-end flows over the full stack (Postgres + API + web). No Playwright, no AI `chat` commands — flows are static JSON specs driven by the `agent-browser` CLI over CDP. No LLM, no API keys.

## Commands

```sh
# Install agent-browser once
npm i -g agent-browser && agent-browser install

# Hermetic run (recommended) — isolated Postgres on alternate ports, never touches dev DB
./scripts/e2e.sh
# or:
cd e2e && npm install && npm run e2e:hermetic

# Against your own running stack (only safe if DB has only the seeded demo repo)
cd e2e && npm install && npm test
```

## Key files

| File | Role |
|------|------|
| `run.ts` | Test runner — iterates flows, invokes agent-browser per step, reports pass/fail |
| `specs/*.flow.json` | Flow definitions — ordered steps with agent-browser commands |
| `lib/assert.ts` | `stdoutIncludes` assertion helper |
| `agent-browser.json` | agent-browser CLI config |

## Flow format

```jsonc
{
  "name": "Human-readable name",
  "steps": [
    { "cmd": ["open", "{BASE}/"],        "label": "load root" },
    { "cmd": ["wait", "--url", "/pulls"],"label": "redirect lands" },
    { "cmd": ["wait", "--text", "#482"], "label": "seeded PR visible",
      "assert": { "stdoutIncludes": "482" } }
  ]
}
```

- `{BASE}` → `E2E_BASE_URL` (default `http://localhost:3000`)
- Each `cmd` is passed verbatim to `agent-browser`. Non-zero exit fails the step.
- Locators: only `--url`, `--text`, `find role|text|label` — never the AI `chat` command.

## Flow coverage

| Spec | What it checks |
|------|---------------|
| `01-app-boot` | Root redirects to first repo's PR list; seeded PR #482 visible |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | Agents list renders seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → seeded run verdict + findings; FindingCard expand |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file in diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders |
| `07-settings` | `/settings/api-keys` and `/settings/models` → section titles render |

## Critical precondition

Flows 02, 04, 05 follow the home redirect to the **first** repo. They assume the seeded demo repo (`acme/payments-api`) is the **only** repo in the DB. CI guarantees this. Your local dev DB usually has others — use the hermetic runner (`./scripts/e2e.sh`) to avoid false failures.

## Hermetic runner env knobs

| Var | Default |
|-----|---------|
| `E2E_PG_PORT` | `5433` |
| `E2E_API_PORT` | `3101` |
| `E2E_WEB_PORT` | `3100` |
| `E2E_PG_CONTAINER` | `devdigest-e2e-postgres` |
| `E2E_BASE_URL` | `http://localhost:3100` |
| `E2E_STEP_TIMEOUT` | `60000` (ms) |

Failure screenshots → `e2e/test-results/` (git-ignored; uploaded as CI artifact).
