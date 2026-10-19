# e2e — @devdigest/e2e

Deterministic browser flows driven by agent-browser (CDP CLI). No Playwright,
no LLM, no API key. Human docs: `README.md` (source of truth).

## Where things live
- `specs/NN-name.flow.json`  one flow = ordered list of agent-browser commands
- `run.ts`                   runs every flow against one shared browser session
- `lib/assert.ts`            assertion helpers
- `../scripts/e2e.sh`        hermetic run: fresh DB + seed + API + web

## Conventions (non-default)
- `specs/` here means test flows, not feature specs. Feature specs for e2e
  work go in `docs/`.
- Uses npm (`package-lock.json`), not pnpm.
- Flows assert on seeded data (`acme/payments-api`, PR #482) — never on LLM output.
- Coverage is typological, not exhaustive: one flow per kind of screen/interaction.

## Read when
- Writing or changing a flow → README.md §How a flow works.
- Running locally (hermetic vs your own stack) → README.md §Run locally.
- Deciding whether a new flow is needed → README.md §Coverage and ../TESTING.md.
- Before any edit here → INSIGHTS.md.
