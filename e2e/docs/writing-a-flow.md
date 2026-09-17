# Writing and debugging a flow

The flow format, the precondition, and how to run the suite are in
[`../README.md`](../README.md). This page covers runner behavior that the
README doesn't: what happens between steps, what a failure leaves behind, and
what seeded data you can assert on.

## What the runner actually does

`run.ts` is a small loop, not a test framework:

- **Order:** the `*.flow.json` files run in **lexical filename order**
  (`loadFlows`, `run.ts:53`). The `NN-` prefix is the order.
- **One browser session for the whole suite.** agent-browser's daemon keeps the
  page between commands **and between flows**; it is closed only once at the
  end (`run.ts:110`). A flow inherits the previous flow's URL, scroll position
  and open drawers, so **start every flow with `open {BASE}/…`**.
- **Each step** is one `execFile(agent-browser, args)` with a
  `E2E_STEP_TIMEOUT` timeout (default 60 s) (`run.ts:44`). A non-zero exit
  fails the step.
- **The first failing step stops that flow** (`break`), and the runner moves
  on to the next flow. Each flow reports only its first failure.
- `{BASE}` substitution strips a trailing `/` from `E2E_BASE_URL`
  (`lib/assert.ts:37`), so write `{BASE}/pulls`, not `{BASE}pulls`.
- `assert.stdoutIncludes` is a plain `String.includes` on that command's stdout
  (`lib/assert.ts:42`). It is case-sensitive, with no regex.

## When a step fails

| Failure | What you get |
| --- | --- |
| Command exits non-zero (a `wait` timed out, `find` matched nothing, …) | `✗ label — <first line of the error>`, plus a screenshot at `test-results/<NN-name>-fail.png` |
| `stdoutIncludes` missing | `✗ label — assertion failed`, **no screenshot** |
| agent-browser not installed | every step fails with `spawn agent-browser ENOENT` |

Only the **first line** of the error is printed (`run.ts:81`). To see the full
agent-browser output, run that one command by hand against the same stack:

```sh
E2E_BASE_URL=http://localhost:3100   # hermetic web port
agent-browser open "$E2E_BASE_URL/"
agent-browser find role button click --name "Agent runs"
agent-browser screenshot /tmp/now.png
```

Set `"headed": true` in `agent-browser.json` to watch the browser locally.
Don't commit that change; CI runs headless.

## Choosing locators

Prefer them in this order:
1. `wait --url <fragment>` for navigation and tab state (tabs live in the
   query string, e.g. `tab=findings` is the **"Agent runs"** tab).
2. `find role <role> click --name "<accessible name>"` for buttons and tabs.
3. `wait --text "<visible text>"` for content. It matches **rendered** text,
   so CSS `text-transform` can matter. Severity pills render "2 Critical" as
   "2 CRITICAL"; check the screenshot before choosing the casing.

Add `wait --load networkidle` after a navigation that fetches several queries
(flow `04` does). Otherwise a later `wait --text` may pass on a loading
placeholder or time out while data is still loading.

Never use the AI `chat` command, never click something that writes (Run
review, Accept, Dismiss, Delete), and never click something that opens
`window.confirm`: the dialog blocks the session.

## What the seed gives you

`server/src/db/seed.ts` creates the only data a flow can rely on:

| Data | Usable for |
| --- | --- |
| repo `acme/payments-api` | home redirect target (flows 01, 02) |
| PR #482 "Add rate limiting to public API endpoints" | list row, detail, Files tab (02, 04, 05) |
| one review, verdict `request changes`, 2 findings (1 CRITICAL, 1 WARNING) with **no `run_id`** | Review runs card, FindingCard text ("Hardcoded Stripe secret key in commit"), severity pills, PR list FINDINGS badges |
| seeded reviewer agents | Agents list (03) |

Because the seeded review has **no `agent_runs` row**:
- the Agent runs **Timeline is empty**, so there is nothing to assert about
  Timeline badges or per-run cost;
- PR list **COST shows "—"**, and the trace drawer can't be opened for it.

Asserting on run cost, the Timeline, or the trace drawer needs a seeded run
first. That is a change to `server/src/db/seed.ts`, not to the flow.

## Hermetic stack details

`scripts/e2e.sh` (`npm run e2e:hermetic`):

- Uses ports **:5433 / :3101 / :3100** (override with
  `E2E_PG_PORT` / `E2E_API_PORT` / `E2E_WEB_PORT`) and a `--rm` Postgres
  container with no volume, so the DB is empty on every run.
- Exports `DATABASE_URL`, `NEXT_PUBLIC_API_BASE` and `WEB_PORT` **before**
  starting anything. dotenv doesn't override variables that are already set,
  so `server/.env` is ignored. `WEB_PORT` also drives the API's CORS origin.
- Refuses to migrate or seed unless `DATABASE_URL` is on the isolated port.
- Runs the API with plain `tsx` (not `tsx watch`) so a file save can't restart
  it mid-suite.
- On exit or Ctrl-C it kills the whole process tree and anything still
  listening on the two alt ports, then removes the container. A leftover
  container is also removed at startup, but leftover **processes are not**. If
  a previous run was killed with `-9` and `:3101`/`:3100` are still taken, the
  new API and web can't bind. The health checks may then pass against the
  stale processes, which point at a database that no longer exists. Free the
  ports first with
  `lsof -nP -iTCP:3101 -sTCP:LISTEN -t | xargs kill`.

CI (`.github/workflows/e2e-web.yml`) doesn't use this script. It brings up its
own stack and calls `npm test` directly.
