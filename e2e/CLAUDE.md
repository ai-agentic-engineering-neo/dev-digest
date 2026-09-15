# e2e — @devdigest/e2e (browser end-to-end suite)

Deterministic UI flows driven by Vercel **agent-browser** (native Rust+CDP CLI)
— no Playwright, no LLM, no API key. Flow format + coverage table →
[README.md](README.md).

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
./scripts/e2e.sh          # hermetic (recommended): isolated stack, alternate ports, self-tears-down
# or: cd e2e && npm install && npm run e2e:hermetic
npm run typecheck
```

## Map

- `specs/NN-name.flow.json` — each flow is a JSON list of `agent-browser` commands run in order; **this is test-flow data, not product specs** (this module has no separate product-specs folder)
- `run.ts` — executes flows against one shared browser session
- `lib/` — flow runner helpers

## References

- [docs/](docs/) — deeper notes that don't fit the README
- [insights.md](insights.md) — gotchas discovered while working here; check before deep-diving. New findings get appended here by the `engineering-insights` skill

## Gotchas

- **Flows assume a freshly-seeded DB** with only the demo repo (`acme/payments-api`, PR #482) — running `npm test` against your normal dev DB (which usually has other imported repos) makes flows 02/04/05 land on the wrong repo and fail. Always prefer the hermetic runner.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command; keep new steps in that style.
- Failure screenshots → `e2e/test-results/` (git-ignored, uploaded as a CI artifact).
- **Never `docker compose down -v`** to reset for testing — see root [CLAUDE.md](../CLAUDE.md).
