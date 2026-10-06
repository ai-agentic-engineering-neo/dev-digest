# e2e — @devdigest/e2e

Deterministic browser flows driven by the agent-browser CLI (no Playwright, no LLM). TypeScript + tsx. Package manager: **npm**.

## Docs — read when relevant
- [README.md](README.md) — flow format, env knobs, coverage table.
- [docs/](docs/) — deeper notes on the runner.
- [specs/](specs/) — **here specs = the flows themselves** (`NN-name.flow.json`). Feature acceptance lives in the module's own `specs/`.

## Commands
- Recommended: `npm run e2e:hermetic` (isolated stack on :5433/:3101/:3100, safe alongside dev)
- Against running dev stack: `npm test` — only if the DB contains only the seeded repo
- `npm run typecheck`

## Where things live
- `specs/*.flow.json` — flows · `run.ts` — runner · `lib/` — helpers
- `../scripts/e2e.sh` — hermetic stack · failure screenshots → `test-results/` (git-ignored)

## Conventions
- Deterministic locators only: `wait --url|--text`, `find role|text|label`. Never the AI `chat` command.
- Flows are read-only over seeded data (`acme/payments-api`, PR #482). No submits that call a model.
- New flow → next `NN-` number + a row in the README coverage table.

## Gotchas
- Flows 02/04/05 assume the seeded repo is the **only** repo — they fail on a normal dev DB.

## Do not touch
- Never `docker compose down -v` to reset — it wipes the real dev volume `devdigest_pgdata`.

## Insights
@INSIGHTS.md
