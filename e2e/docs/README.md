# e2e/docs — Runner Architecture

## Overview

The DevDigest e2e test runner is a deterministic, CDP-driven system that executes browser flows without LLM calls or API keys. It uses Vercel's [agent-browser](https://github.com/vercel-labs/agent-browser) — a native Rust CLI for browser automation — to drive a Chrome instance and verify UI behavior against read-only seeded data.

## How run.ts Drives agent-browser

The runner (`run.ts`, lines 1–120) orchestrates browser automation by:

1. **Loading flows from disk** (lines 53–61). It reads all `specs/*.flow.json` files in lexical order, each containing a list of agent-browser commands.

2. **Executing steps sequentially** (lines 63–92). For each flow, `run.ts` iterates over its steps. Each step's `cmd` array is resolved for `{BASE}` substitution (line 69), then passed to the `ab()` helper (line 72).

3. **The `ab()` helper** (lines 44–51) invokes the agent-browser CLI via `execFile`, captures stdout, and rejects on any non-zero exit. Non-zero exit codes — from timeouts, network errors, or failed wait conditions — fail the step and halt the flow.

4. **Optional assertions** (lines 72–74). After a command succeeds, an optional `assert.stdoutIncludes` check (lib/assert.ts, lines 14–15) validates that the stdout contains a required substring. This is a second layer of validation beyond the exit code; most assertions are implicit in agent-browser's own `wait --text` and `wait --url` commands, which exit non-zero if their condition never holds.

5. **Failure handling** (lines 80–87). When a step fails, the runner captures a best-effort screenshot and writes it to `test-results/{id}-fail.png` for artifact upload (see Failure Artifacts below).

6. **Completion and teardown** (lines 110–114). After all flows, the runner closes the shared browser session and exits 0 if all flows pass, non-zero otherwise.

## Environment Variables and Templating

The runner accepts three env knobs (run.ts, lines 39–41):

- **`E2E_BASE_URL`** (default `http://localhost:3000`): The web app origin. Every flow step's `cmd` array can include `{BASE}`, which is substituted with this value (stripped of trailing slashes). For example, `["open", "{BASE}/agents"]` becomes `["open", "http://localhost:3000/agents"]` (lib/assert.ts, lines 37–40).

- **`AGENT_BROWSER_BIN`** (default `"agent-browser"`): The binary name or path. Allows using a custom build or version.

- **`E2E_STEP_TIMEOUT`** (default `60000` ms): Per-command timeout. Commands that exceed this time (e.g., a `wait` that never reaches its condition) are killed and fail the step.

## Hermetic vs. Against-Your-Own-Stack Modes

Flows target read-only seeded data (the demo repo `acme/payments-api`, PR #482, and seeded agents). Because flows 02, 04, and 05 assume the seeded demo repo is the first repo in the database, they can only run against a freshly-seeded DB (README.md, lines 38–44).

**Hermetic mode** (recommended for local development):

```sh
./scripts/e2e.sh
# or: cd e2e && npm run e2e:hermetic
```

Boots an isolated, ephemeral Postgres container on alternate ports (README.md, lines 59–70):
- Postgres on `:5433` (no persistent volume)
- API on `:3101`
- Web on `:3100`

The isolation guarantees that flows 02/04/05 land on the seeded demo repo as the first repo. After tests, the stack is torn down. This mode is safe to run while your normal dev stack is up — it never touches your dev DB or the `devdigest_pgdata` volume (README.md, lines 67–69).

**Against your own running stack** (only safe with a clean DB):

```sh
./scripts/dev.sh          # Start your stack
cd e2e && npm test        # Run flows
```

This mode requires your dev DB to contain *only* the seeded repo — otherwise flows 02/04/05 fail because they land on the wrong repo. If your DB has imported other repos, use the hermetic runner instead (README.md, lines 71–79).

## Adding a New Flow

1. **Create the spec file** in `specs/` with the naming convention `specs/NN-kebab-name.flow.json` (where `NN` is a zero-padded run order). Example structure (from 01-app-boot.flow.json):

```json
{
  "name": "Human-readable flow name",
  "description": "Why this flow matters and what it exercises",
  "steps": [
    { "cmd": ["open", "{BASE}/"],              "label": "load the app root" },
    { "cmd": ["wait", "--text", "Pull Requests"], "label": "heading renders" }
  ]
}
```

- Each step's `cmd` is an agent-browser command (e.g., `["open", ...]`, `["wait", ...]`, `["find", ...]`, `["click", ...]`).
- `{BASE}` is substituted at runtime (lib/assert.ts, lines 37–40).
- The `label` is human-readable for logs; omit it and the joined `cmd` is used.
- `assert?: { stdoutIncludes?: string }` adds a substring check on stdout (lib/assert.ts, lines 14–15).

2. **Write the prose spec** in `specs-docs/NN-kebab-name.md` documenting the user journey and key assertions. See CLAUDE.md line 16 and specs-docs/README.md for the naming convention.

3. **Run the suite** to verify. The runner executes flows in lexical order, so the new flow runs after existing flows whose numbers are smaller. Non-zero exit = failure (run.ts, line 114).

## Failure Artifacts

When a step fails (non-zero exit), `run.ts` captures a screenshot to `test-results/{id}-fail.png` (lines 85–86). These artifacts are git-ignored and uploaded by CI (`.github/workflows/e2e-web.yml`, README.md line 90) for debugging. If you see a test failure in CI, the screenshot artifact shows the browser state at the moment the flow broke.
