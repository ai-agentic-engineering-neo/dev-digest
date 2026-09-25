# The e2e runner

How `@devdigest/e2e` turns a JSON flow into a browser run, and how the stack
around it is started. Everything below is taken from `run.ts`, `lib/assert.ts`,
`scripts/e2e.sh` and `.github/workflows/e2e-web.yml`. The per-flow contract and
the seeded facts each flow depends on live in `../specs/flows.md`.

## agent-browser instead of Playwright

The flows are driven by Vercel `agent-browser`, a native browser-automation CLI
(Rust, talks CDP) that is installed once as a global binary:
`npm i -g agent-browser && agent-browser install`. It is a CLI, not a test
framework: every invocation is a separate process, and a daemon keeps one
browser session alive between invocations, so consecutive commands act on the
same page (`run.ts` header comment).

The package therefore has no Playwright, no test runner and no model key.
`README.md` and `CLAUDE.md` state the trade the package makes: a thin JSON
convention plus a ~120 line runner instead of a framework, in exchange for a
suite that is deterministic, key-free and cheap to keep green. The one thing
agent-browser offers that this package deliberately does not use is its AI
`chat` command (see "Banned commands").

`agent-browser.json` pins the CLI config: `headed: false`,
`ignoreHttpsErrors: false`.

## Flow file format

A flow is one file at `specs/NN-name.flow.json`. Its shape is the `Flow`
interface in `lib/assert.ts`:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Printed as the flow header and in the PASS/FAIL summary |
| `description` | string, optional | Free text: journey, seeded assumptions, what it exercises |
| `steps[]` | `Step[]` | Ordered agent-browser invocations |
| `steps[].cmd` | string[] | The exact argv passed to `agent-browser` |
| `steps[].label` | string, optional | Log line for the step; defaults to `cmd.join(" ")` |
| `steps[].assert.stdoutIncludes` | string, optional | Extra substring check on the command's stdout |

`{BASE}` inside any argv element is replaced by `E2E_BASE_URL` (default
`http://localhost:3000`) with a trailing slash trimmed (`resolveArgs`). No other
placeholders exist. None of the eight current flows use `assert`; the exit code
of each command is the assertion.

## How `run.ts` executes a run

1. `loadFlows()` reads `specs/`, keeps files ending in `.flow.json`, sorts them
   lexically and parses each as JSON. Run order is therefore the `NN-` prefix.
   Zero flows is an error (exit 1).
2. For each flow, `runFlow()` walks `steps` in order. Each step becomes one
   child process: `execFile(BIN, args, { cwd: e2e/, timeout: STEP_TIMEOUT,
   maxBuffer: 32 MiB })`, where `BIN` is `AGENT_BROWSER_BIN` (default
   `agent-browser`) and `STEP_TIMEOUT` is `E2E_STEP_TIMEOUT` ms (default 60000).
3. Failure is detected two ways:
   - the child exits non-zero or hits the timeout: `execFile` rejects. The
     runner records the first line of the error message, creates
     `test-results/` and takes a best-effort `agent-browser screenshot
     test-results/<flow-id>-fail.png` (errors from the screenshot itself are
     swallowed), then `break`s out of the flow.
   - `assert.stdoutIncludes` is set and the stdout lacks it: the step is marked
     failed with `stdout missing "..."` and the flow breaks. No screenshot.
   Remaining steps of a failed flow are skipped, but the next flow still runs.
4. After all flows, a `finally` block runs `agent-browser close` to tear down
   the shared session regardless of outcome.
5. `summarize()` prints `PASS`/`FAIL` per flow, each failed step with its
   detail, and `N/M flows passed`. Exit code is 0 only when every flow passed,
   otherwise 1. An uncaught error in `main()` prints `e2e runner crashed` and
   also exits 1.

`test-results/` is git-ignored and is the only thing CI uploads on failure.

## `lib/assert.ts`

Deliberately tiny. It exports the `Step`, `Flow`, `StepResult` and `FlowResult`
types, plus three pure helpers: `resolveArgs` (the `{BASE}` substitution),
`stdoutContains` (a `String.prototype.includes` wrapper behind
`assert.stdoutIncludes`) and `summarize` (the final report). The file's own
comment states the design: the real assertions are agent-browser's `wait`
commands, which exit non-zero when their condition never holds.

## Command families

Only these appear in the current flows. All are deterministic.

| Command | Used for | Fails when |
|---|---|---|
| `open <url>` | Navigate the shared session | Navigation error |
| `wait --url <fragment>` | Route assertion (`/pulls`, `/pulls/482`, `tab=findings`) | Fragment never appears in the URL before timeout |
| `wait --text <text>` | Rendered-text assertion (titles, badges, headings) | Text never appears before timeout |
| `wait --load networkidle` | Let a data fetch settle before asserting | Never reaches idle |
| `find text <text> click` | Click a row by its visible text | No match |
| `find role button click --name <name>` | Click a tab or icon button by accessible name | No match |
| `screenshot <path>` | Runner only, on step failure | Never fails the run |
| `close` | Runner only, in `finally` | Never fails the run |

`wait --text` accepts literal `$` and `·` (flow 08 waits for
`9,119 tok · $0.0013`), and it tolerates the text appearing more than once
(flow 04's `2 findings` matches both the accordion header and the verdict
banner; see `INSIGHTS.md`).

### Banned commands

The AI `chat` command is never used. It would require a model key, make each
run non-deterministic, and put an LLM back into the loop that the whole suite
exists to avoid (`../TESTING.md`, `CLAUDE.md`, `README.md`). A flow that needs
something `wait`/`find` cannot express should get a stable accessible name or
text in the app instead.

## Hermetic runner versus CI

### `scripts/e2e.sh` (local)

`npm run e2e:hermetic` runs `../scripts/e2e.sh`. It boots an isolated stack on
alternate ports so it can run next to a live dev stack and never touches the
dev DB or the `devdigest_pgdata` volume:

- Postgres: `docker run -d --rm` of `pgvector/pgvector:pg16` as container
  `devdigest-e2e-postgres` on `:5433`, with no named volume, so it is empty on
  every run. A health loop waits for `pg_isready`.
- API on `:3101` via `pnpm exec tsx src/server.ts` (not `pnpm start`, which
  needs a build; not `tsx watch`, to avoid a mid-suite restart). Web on
  `:3100` via `pnpm exec next dev -p 3100`.
- Env is exported before any tsx/next spawn: `DATABASE_URL`, `API_PORT`,
  `WEB_PORT`, `NEXT_PUBLIC_API_BASE`, `E2E_BASE_URL`. dotenv does not override
  already-set variables, so these win over `server/.env` without editing it.
  `WEB_PORT` must be exported because the API derives its CORS allow-origin
  from it.
- `DATABASE_URL` uses `127.0.0.1`, not `localhost`, to avoid an IPv6 `::1`
  versus published-IPv4 mismatch against the container. A guard refuses to
  migrate or seed unless `DATABASE_URL` is on the isolated port.
- `pnpm db:migrate` then `pnpm db:seed` run against the isolated DB; deps for
  `server`, `client` and `reviewer-core` are installed only if `node_modules`
  is missing.
- A `trap cleanup EXIT INT TERM` is installed before anything starts. It kills
  the API and web process trees leaves-first (`kill_tree`, because `pnpm exec
  tsx` and `next dev` spawn the listener as a grandchild), reaps anything still
  bound to the two alternate ports, removes the container, and exits with the
  e2e run's status.
- All ports, the container name and image are overridable through
  `E2E_PG_PORT`, `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_PG_CONTAINER`,
  `E2E_PG_IMAGE`.

### `.github/workflows/e2e-web.yml` (CI)

CI does not call `scripts/e2e.sh`. It reproduces the dev stack on the standard
ports: `docker compose up -d` (container `devdigest-postgres`, `:5432`),
`pnpm db:migrate` + `pnpm db:seed`, `npm ci` in `reviewer-core` (the API
imports its raw source through a tsconfig alias), the API via `nohup pnpm exec
tsx src/server.ts` on `:3001`, and the web via `pnpm build` + `pnpm start` on
`:3000`. It installs the CLI with `agent-browser install --with-deps`, runs
`npm ci && npm test` in `e2e/`, and uploads `e2e/test-results/**` as the
`e2e-failure` artifact only when the job fails. The workflow is path-filtered
to `client/**`, `server/**`, `e2e/**` and itself, and cancels in-progress runs
per ref. No secrets are set: the API boots with every secret optional.

## The seeded-data assumption

Every flow asserts on the fixtures inserted by `server/src/db/seed.ts`: the
demo repo `acme/payments-api`, PR #482, its seeded review with two findings, one
completed priced agent run, and the three built-in agents. Nothing is created,
edited or deleted, and nothing triggers a model call.

Flows 01, 02, 04, 05 and 08 start at `/` and follow the client's redirect to
`/repos/<first repo id>/pulls` (`client/src/app/page.tsx` sends the user to
`repos[0]`). They therefore require the demo repo to be the first and only
repo. A fresh DB guarantees that; a dev DB with imported repos does not, which
is why `npm test` against the dev stack is only safe on a clean DB and the
hermetic runner is the default locally.

## Adding a flow

1. Create `specs/NN-name.flow.json` with the next free `NN` prefix; the runner
   picks it up by filename, nothing registers it.
2. Use only the command families above and assert only on seeded data.
3. Add a row to the coverage table in `README.md`, and a section to
   `specs/flows.md` listing the seeded facts and locators it depends on.
4. Run `./scripts/e2e.sh` and expect `N/N flows passed`.

## Sequence of one flow run

```mermaid
sequenceDiagram
    participant R as run.ts
    participant AB as agent-browser CLI
    participant D as browser daemon
    participant W as web :3100 / API :3101

    R->>R: loadFlows() sorts specs/*.flow.json
    loop each step in flow.steps
        R->>R: resolveArgs(cmd, E2E_BASE_URL)
        R->>AB: execFile(bin, args, timeout)
        AB->>D: CDP command (open / wait / find)
        D->>W: navigate, fetch, render
        D-->>AB: condition met, or timeout
        AB-->>R: exit 0 (stdout) or non-zero
        alt non-zero exit
            R->>AB: screenshot test-results/<id>-fail.png
            R->>R: break (skip remaining steps)
        end
    end
    R->>AB: close (finally)
    R->>R: summarize(); exit 0 or 1
```
