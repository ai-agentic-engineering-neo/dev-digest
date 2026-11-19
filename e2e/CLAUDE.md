# e2e — browser end-to-end suite

Deterministic UI flows via agent-browser (no Playwright, no LLM, no key). How a flow works: `README.md`.

## Rules
- Flows are `specs/NN-name.flow.json` — a list of agent-browser commands run by `run.ts`. Use `npm test` (npm, not pnpm).
- Assertions are `wait --url` / `wait --text` (non-zero exit = fail). Never use the AI `chat` command.
- Flows target read-only seeded data (`acme/payments-api`, PR #482); nothing may trigger a model call.
- Hermetic full-stack run: `npm run e2e:hermetic` (`../scripts/e2e.sh`).

## Gotchas
- **`specs/` here means flow files, not feature briefs.** Put feature briefs in `docs/` instead.
- Flow `02` assumes a freshly-seeded DB where the demo repo is the only repo.

## Look here when relevant (not auto-loaded)
- `docs/` explanations · `INSIGHTS.md` learned gotchas
- Test strategy: `../TESTING.md`
