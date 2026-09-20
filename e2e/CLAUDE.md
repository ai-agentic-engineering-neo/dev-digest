# e2e (@devdigest/e2e)

Deterministic browser flows driven by Vercel agent-browser: no Playwright, no LLM, no API key. Stack: TypeScript ESM (`"type": "module"`), Node >= 22, tsx runner; no test framework.

## Commands
- `npm install`
- `npm run e2e:hermetic` (runs `../scripts/e2e.sh`): isolated, freshly-seeded stack, recommended
- `npm test` (`tsx run.ts`): flows against an already-running server and client

## Verify
- `npm run typecheck`
- `npm run e2e:hermetic` (needs Docker)
- No linter or formatter is configured; do not add a lint command.

## Naming conventions
- Scenarios are `specs/NN-name.flow.json`; `specs/` doubles as the specs index (`specs/README.md`).

## Hard rules and gotchas
- Needs the server and client running (or the hermetic runner); `{BASE}` is `E2E_BASE_URL`, default `http://localhost:3000`.
- Flows assume a freshly-seeded DB (demo repo `acme/payments-api`, PR #482); on a dev DB with other repos flows 02/04/05 fail.
- Locators are deterministic only (`--url`, `--text`, `find ...`); never the AI `chat` command.
- Never run `docker compose down -v` to reset the dev DB: it deletes the `devdigest_pgdata` volume.

## Read when
- Read [README](README.md) when running flows or setting up agent-browser.
- Read [docs](docs/README.md) when you need how-it-works detail.
- Read [specs](specs/README.md) before adding or editing a flow.
- Read [INSIGHTS](INSIGHTS.md) at the start of any task in this module.
- Read [TESTING](../TESTING.md) when touching CI or the e2e-web workflow.
- Read the [root README](../README.md) when setting up the whole project.

## Folder map
- `lib/`: assertions, helpers and types for the runner
- `specs/`: `NN-name.flow.json` scenarios plus the index
