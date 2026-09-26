# e2e — how a flow runs, and how to write one

`@devdigest/e2e` drives the real web app in a real browser through
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser), a
native (Rust + CDP) automation CLI. No Playwright, no LLM, no API key.

The flow format and the env knobs are summarised in
[`../README.md`](../README.md); what each flow actually pins is in
[`coverage-spec.md`](coverage-spec.md). This document is the runner's mechanics —
read it before writing or debugging a flow.

## Why there is a runner at all

agent-browser is a CLI, not a test framework: it has no notion of a suite, a
report, or a pass/fail exit code across many commands. `run.ts` adds exactly the
thin convention that was missing and nothing more:

- a flow is a JSON list of agent-browser invocations;
- flows execute in the **lexical order of their filenames**, which is why they
  are numbered;
- all commands in a session share **one browser session** — the daemon keeps the
  page between invocations, so step *n+1* continues where *n* left off;
- a non-zero exit from any command fails that step and the whole flow.

## The types

From `lib/assert.ts`:

```ts
interface Step {
  cmd: string[];                          // agent-browser argv; {BASE} is substituted
  label?: string;                         // human label for logs
  assert?: { stdoutIncludes?: string };   // optional extra check on stdout
}

interface Flow {
  name: string;
  description?: string;
  steps: Step[];
}
```

`resolveArgs` substitutes `{BASE}` (trimming a trailing slash) in every argument.
`summarize` prints `PASS`/`FAIL` per flow, the failing step labels, and a final
`n/m flows passed`.

## Assertions are exit codes

This is the part that surprises people: **there is no assertion library.**
`wait --text "…"` and `wait --url "…"` *are* the assertions — they poll until the
condition holds and exit non-zero when it never does. `assert.stdoutIncludes` is
a small extra substring check layered on top, not the primary mechanism.

The consequence worth internalising: **you can assert presence, never absence.**
There is no "this text is gone" command. A flow that needs to prove something was
filtered out asserts on what *remains* plus the URL that caused it — see the
severity-filter steps in flow 04.

## Locator rules

Deterministic locators only:

| Allowed | Example |
|---|---|
| URL | `["wait", "--url", "/pulls/482"]` |
| text | `["wait", "--text", "Add rate limiting to public API endpoints"]` |
| find + click | `["find", "role", "button", "click", "--name", "Agent runs"]` |
| load state | `["wait", "--load", "networkidle"]` |

The AI `chat` command is **banned**. It makes runs non-deterministic and requires
a model key, which would break the suite's core promise: these flows never call a
model.

Because `find role button --name` matches the **accessible name**, a control that
a flow needs to click must carry a real `aria-label` rather than only a `title`.
That is a UI-side requirement this suite imposes on the app.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | web origin substituted for `{BASE}` |
| `AGENT_BROWSER_BIN` | `agent-browser` | binary name or path |
| `E2E_STEP_TIMEOUT` | `60000` | per-command timeout in ms |

A failing step writes a screenshot to `test-results/<id>-fail.png`, which CI
uploads as an artifact. `test-results/**` is generated output.

## Running it

```sh
npm i -g agent-browser && agent-browser install   # once; downloads Chrome for Testing
../scripts/e2e.sh                                 # hermetic, recommended
```

`scripts/e2e.sh` brings up an **isolated** stack on alternate ports — Postgres
`5433`, API `3101`, web `3100` — migrates and seeds it, runs the flows, and tears
down the child processes and the container on success, failure, or Ctrl-C. Its
Postgres has no persistent volume, so it is empty every run: the seeded demo repo
is the only repo, which is what flows `02` / `04` / `05` require when they follow
the home redirect.

Running `npm test` straight against your dev stack is only safe if your dev DB
contains just the seeded repo. Otherwise those flows land on the wrong repo and
fail for reasons that have nothing to do with the app.

> Never `docker compose down -v` to "reset" the dev DB — `-v` deletes the
> `devdigest_pgdata` volume along with every repo and review you imported.

## Adding a flow

1. Create `specs/NN-name.flow.json`; pick `NN` for the position you want in the
   run order.
2. Start from a known entry point (`open {BASE}/`) and `wait --url` your way in —
   do not assume the session's current page.
3. Prefer asserting text the user actually reads over internal ids.
4. Add a row to the coverage table in [`../README.md`](../README.md) and describe
   what it pins in [`coverage-spec.md`](coverage-spec.md).
5. Keep it read-only. Nothing in this suite may trigger a model call or write
   data the next flow depends on.

Written specs live in this `docs/` folder. `../specs/` holds flow JSON — the
runner ignores anything there that is not `*.flow.json`.
