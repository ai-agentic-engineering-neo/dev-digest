# e2e — structure

## Folders
| Path | Purpose |
|---|---|
| `run.ts` | Runner: loads `specs/*.flow.json` (sorted), substitutes `{BASE}`, executes each `cmd` via `execFile(agent-browser)`, screenshots on failure, prints summary, exits 0/1. |
| `lib/assert.ts` | Types `Flow`, `Step`, `StepResult`, `FlowResult`; `resolveArgs`, `stdoutContains`, `summarize`. |
| `specs/NN-<name>.flow.json` | Executable flows. Current set: `01-app-boot`, `02-repo-pulls-detail`, `03-agents`, `04-pr-findings`, `05-pr-diff`, `06-onboarding`, `07-settings`. |
| `agent-browser.json` | CLI config (`headed: false`, `ignoreHttpsErrors: false`). |
| `test-results/` | Failure screenshots `<flow-id>-fail.png`; git-ignored; CI artifact `e2e-failure`. |
| `../scripts/e2e.sh` | Hermetic local runner: ephemeral Postgres on 5433, API 3101, web 3100, migrate + seed, run `npm test`, tear down. Not used by CI. |
| `../.github/workflows/e2e-web.yml` | CI: `docker compose up`, server migrate/seed + `tsx src/server.ts`, client `build`/`start`, `agent-browser install --with-deps`, `npm test`. |
| `package.json` | `test`, `e2e:hermetic`, `lint`, `typecheck`. npm + `package-lock.json`. |
| `tsconfig.json`, `eslint.config.mjs` | Static checks for `run.ts` and `lib/**`. |

## Entry points
- `npm test` (needs a live stack and the `agent-browser` binary on PATH or `AGENT_BROWSER_BIN`).
- `npm run e2e:hermetic` → `../scripts/e2e.sh` (needs Docker, pnpm, agent-browser).
- No global install needed: `npm i agent-browser` in any temp dir and point `AGENT_BROWSER_BIN` at `node_modules/.bin/agent-browser` (`INSIGHTS.md`).

## Flow anatomy
```jsonc
{ "name": "…", "description": "why + preconditions",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "land on the PR list" },
    { "cmd": ["find", "role", "button", "click", "--name", "Agent runs"], "label": "switch tab" },
    { "cmd": ["find", "role", "dialog", "text", "--name", "2 findings"],
      "assert": { "stdoutIncludes": "N+1 query in user list endpoint" }, "label": "popover lists both findings" }
  ] }
```

## Reference files
- To see the smallest smoke flow (boot → redirect → heading), read `specs/01-app-boot.flow.json`.
- To see hover popovers, `find … --name --exact`, and stdout assertions, read `specs/04-pr-findings.flow.json`.
- To see cost and severity assertions on the PR list, read `specs/02-repo-pulls-detail.flow.json`.
- To see how a step is executed and how failure screenshots are taken, read `run.ts` (`runFlow`).
- To see the exact boot sequence CI expects, read `../.github/workflows/e2e-web.yml`; the local mirror is `../scripts/e2e.sh`.
