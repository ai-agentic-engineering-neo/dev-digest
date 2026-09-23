# Hermetic runner

How `npm run e2e:hermetic` works today: `../scripts/e2e.sh` boots a throwaway, seeded
stack on alternate ports, then `run.ts` drives the flows through agent-browser. Flow
format, `{BASE}`, env knobs and coverage are in [`../README.md`](../README.md); this
page covers what happens underneath, how it differs from CI, what it does **not**
isolate, and how to debug a failure. Citations are `path:line`, relative to `e2e/`.

## Entry points

`./scripts/e2e.sh` from the repo root, or `npm run e2e:hermetic` from `e2e/`
(`package.json:9`). Local only: CI boots its own stack and runs `npm test`
(`../scripts/e2e.sh:17-18`). The script installs deps for `server/`, `client/` and
`reviewer-core/` but never for `e2e/` (`../scripts/e2e.sh:113-117`), and ends with
`npm test` → `tsx run.ts` (`../scripts/e2e.sh:163`, `package.json:8`): run
`npm install` in `e2e/` once first.

## What is isolated

| Resource | Hermetic | Dev stack (`./scripts/dev.sh`) |
| -------- | -------- | ------------------------------ |
| Postgres | `devdigest-e2e-postgres` on `:5433`, `pgvector/pgvector:pg16`, no volume (`../scripts/e2e.sh:26-28,87-94`) | `devdigest-postgres` on `:5432`, volume `devdigest_pgdata` (`../docker-compose.yml:6,13,15`) |
| API | `:3101` (`../scripts/e2e.sh:32`) | `:3001` (`../server/src/platform/config.ts:29`) |
| Web | `next dev -p 3100` (`../scripts/e2e.sh:33,148`) | `next dev -p 3000` (`../client/package.json:6`) |

Each default is an `E2E_*` override (`../scripts/e2e.sh:26-33`); besides the README's
five there are `E2E_PG_DB`, `E2E_PG_USER`, `E2E_PG_PASS` (all `devdigest`). The
wiring is exported **before** anything starts (`../scripts/e2e.sh:35-43`):

- `DATABASE_URL` on `127.0.0.1`, not `localhost`, dodging an IPv6 `::1` mismatch (`../scripts/e2e.sh:38-40`).
- `API_PORT`, `WEB_PORT`: the API listens on the first and takes its CORS origin
  from the second (`../server/src/platform/config.ts:29-30,77`).
- `NEXT_PUBLIC_API_BASE=http://localhost:3101`, inlined by `../client/next.config.mjs:9`;
  `E2E_BASE_URL=http://localhost:3100`, read by `run.ts:39`.

The server reads `server/.env` via `import 'dotenv/config'`
(`../server/src/platform/config.ts:1`, `../server/src/db/migrate.ts:1`,
`../server/src/db/seed.ts:1`), which never overrides a set variable: the exports
win, the rest of `server/.env` still applies (`../scripts/e2e.sh:35-37`).

## Boot sequence

1. **Prerequisites.** `docker` and `pnpm` are required; a missing `agent-browser` only
   warns (`../scripts/e2e.sh:49-52`). The check ignores `AGENT_BROWSER_BIN`.
2. **Teardown trap**, before anything starts (`../scripts/e2e.sh:54-82`).
3. **Postgres.** Remove a leftover container, `docker run -d --rm` with a
   `pg_isready` healthcheck, poll up to 60 × 1 s (`../scripts/e2e.sh:84-104`).
4. **Deps**, only where `node_modules` is missing: `pnpm install` (not frozen) in
   `server/` and `client/`, `npm ci` in `reviewer-core/` (`../scripts/e2e.sh:106-117`).
5. **Guard.** Refuse unless `DATABASE_URL` has `:<E2E_PG_PORT>/` (`../scripts/e2e.sh:120-124`).
6. **Migrate + seed** the empty DB (`../scripts/e2e.sh:125-128`), so
   `acme/payments-api` is the only repo; data in [`../specs/flows.md`](../specs/flows.md).
7. **API** via `pnpm exec tsx src/server.ts`: no build, no watcher to restart
   mid-suite (`../scripts/e2e.sh:130-135`). Poll `GET /health`
   (`../server/src/app.ts:100`) up to 60 × 1 s; stop early if the process died
   (`../scripts/e2e.sh:136-144`).
8. **Web** via `pnpm exec next dev -p $WEB_PORT` in `client/`, polled the same way
   (`../scripts/e2e.sh:146-158`).
9. **Flows.** `cd e2e && npm test` under `set +e`; the script exits with its code and
   the trap keeps it (`../scripts/e2e.sh:160-166,68,80`).

API and web logs are not redirected, so they interleave with the flow output
(`../scripts/e2e.sh:134,148`).

## Teardown

On `EXIT`, `INT` or `TERM` (`../scripts/e2e.sh:82`): `kill_tree` the web, then the
API, leaves first, because `pnpm exec tsx` and `next dev` run the listener as a
grandchild that a plain `kill` would orphan (`../scripts/e2e.sh:57-71`). A backstop
then kills whatever still listens on the two alternate ports, never `3000`/`3001`
(`../scripts/e2e.sh:72-78`), so anything else of yours on `3100`/`3101` dies too.
Last, `docker rm -f` the container (`../scripts/e2e.sh:79`).

## How `run.ts` runs the flows

- **Discovery.** Only `specs/*.flow.json`, in filename order (`run.ts:53-61`); no
  single-flow filter. No spec at all → exit 1 (`run.ts:98-101`).
- **Step.** One `execFile(AGENT_BROWSER_BIN, args, { cwd: e2e/, timeout:
  E2E_STEP_TIMEOUT })` with `{BASE}` substituted and its trailing slash trimmed
  (`run.ts:44-51`, `lib/assert.ts:37-40`); non-zero exit or timeout fails it. The cwd
  holds `agent-browser.json`, which sets `"headed": false` (`agent-browser.json:3`).
- **`assert.stdoutIncludes`**: a substring check (`run.ts:73-77`); no flow uses it.
- **Failure.** The first failing step ends its flow (`run.ts:76,87`); the next flow
  still runs (`run.ts:105-107`). A failed command takes a best-effort
  `test-results/<flow file without .flow.json>-fail.png` (`run.ts:64,84-86`); a
  failed `stdoutIncludes` check takes none.
- **Session.** One for all flows, closed in `finally` (`run.ts:104-111`).
- **Result.** `PASS`/`FAIL` per flow, then `N/M flows passed` (`lib/assert.ts:46-57`);
  exit 1 if any flow failed (`run.ts:114`).

Commands in use: `open`, `wait --load networkidle`, `wait --url|--text`, `find text … click`,
`find role button click --name …` (flows); `screenshot`, `close` (`run.ts:86,110`).

## Hermetic vs CI

| | `../scripts/e2e.sh` | `../.github/workflows/e2e-web.yml` |
| - | ------------------- | ---------------------------------- |
| Ports | 5433 / 3101 / 3100 | 5432 / 3001 / 3000 (`e2e-web.yml:33-36`) |
| Postgres | own `docker run --rm` | `docker compose up -d` on a fresh runner (`e2e-web.yml:54-63`) |
| Web | `next dev` | `pnpm build` + `pnpm start`, a production build (`e2e-web.yml:97-108`) |
| Installs | only where `node_modules` is missing | `--frozen-lockfile` and `npm ci` every run (`e2e-web.yml:69,80,100,119`) |
| agent-browser | must already be installed | `npm i -g` + `agent-browser install --with-deps` (`e2e-web.yml:111-114`) |
| Failure screenshots | stay in `e2e/test-results/`, git-ignored (`../.gitignore:22`) | uploaded as artifact `e2e-failure` (`e2e-web.yml:122-129`) |
| Server logs | your terminal | `$RUNNER_TEMP/api.log`, `web.log`, printed only if boot fails (`e2e-web.yml:88,94,102,108`) |

CI runs on push to `main` or a PR touching `client/**`, `server/**`, `e2e/**` or the
workflow (`e2e-web.yml:11-24`). There is no `reviewer-core/**` or `scripts/**`,
although the API runs reviewer-core's source (`e2e-web.yml:73-77`): a change to
either alone does not run the suite.

## Not isolated

- **Secrets.** The API reads `~/.devdigest/secrets.json` (`../server/src/platform/config.ts:74`);
  a stored key wins over env (`../server/src/adapters/secrets/local.ts:37-41`).
- **GitHub.** With a token, the PR list and detail call GitHub for
  `acme/payments-api` (`../server/src/modules/pulls/routes.ts:34-45,212-214`) and fall
  back to the seeded rows when that fails (`../server/src/modules/pulls/routes.ts:75-77,253-256`).
  A successful detail call would replace the seeded files and commits
  (`../server/src/modules/pulls/routes.ts:216-239`).
- **`client/.next`**, shared with the dev web; see the first pitfall.

## Pitfalls

- **The dev web points at `:3101` afterwards.** Both webs run in `client/`
  (`../scripts/e2e.sh:148`, `../scripts/dev.sh:110`), with no separate `distDir` and
  the API base inlined (`../client/next.config.mjs:6-11`). After a hermetic run `:3000`
  can show "Cannot reach the DevDigest engine at http://localhost:3101"
  (`../client/src/lib/api.ts:37`). Restart the dev web (root `INSIGHTS.md` → Recurring errors & fixes).
- **The dev stack can go down.** Observed 2026-09-23: the dev web on `:3000` exited
  during a hermetic run. `dev.sh` runs the client in the foreground, so the script
  then ends and its `EXIT` trap kills the API; Postgres stays up
  (`../scripts/dev.sh:97-110`; root `INSIGHTS.md` → Recurring errors & fixes). Afterwards check
  `lsof -iTCP:3000 -sTCP:LISTEN` and `:3001`; restart with `./scripts/dev.sh --no-seed`.
- **No global agent-browser.** Use any install and the system Chrome (7/7 passed; `INSIGHTS.md` → Tool & library notes):
  `AGENT_BROWSER_BIN=<path>/agent-browser AGENT_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run e2e:hermetic`.
  `run.ts` reads only the first (`run.ts:40`) and passes no `env` to `execFile`
  (`run.ts:45-49`), so agent-browser inherits the second.

## Debugging a failing step

1. Read the `✗` line: the step's label (or joined args) and only the **first line** of
   the thrown error (`run.ts:70,81`); the rest of the message is dropped.
2. Open `test-results/<flow>-fail.png`, the page at the moment of failure (`run.ts:84-86`).
3. Scroll up for API errors in the shared terminal (`../scripts/e2e.sh:134,148`), e.g.
   the GitHub fallback warnings (`../server/src/modules/pulls/routes.ts:76,254`).
4. Replay by hand against a live stack (the hermetic one is gone on exit,
   `../scripts/e2e.sh:82`): `agent-browser open http://localhost:3000/…`, then the
   failing `wait` or `find`. A dev DB with other repos breaks 02/04/05 (`README.md:38-44`).
5. Slow machine: raise `E2E_STEP_TIMEOUT` (`run.ts:41`); the web is `next dev`, not a build.
6. After a copy or route change, check the table in [`../specs/flows.md`](../specs/flows.md).
