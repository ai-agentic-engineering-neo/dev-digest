# e2e — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Custom runner (`run.ts`, not Playwright/Cypress) driving Vercel agent-browser over CDP — deterministic, no LLM in the loop. Test: `pnpm test` (= `tsx run.ts`). Hermetic run: `pnpm e2e:hermetic` (`../scripts/e2e.sh`, direct `tsx`, not `pnpm start`/watch). Typecheck: `pnpm typecheck`.

## Read when

- adding/changing a flow test → `specs/` holds the `.flow.json` files themselves
- writing/checking the product spec behind a flow → `specs-docs/`
- changing runner internals → `docs/README.md`
- **before any work → `INSIGHTS.md` (read first, always)**

## Do not touch

**PENDING:** none identified yet.
