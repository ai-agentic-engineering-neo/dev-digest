# e2e — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Custom runner (`run.ts`, not Playwright/Cypress) driving Vercel agent-browser over CDP — deterministic, no LLM in the loop. Run/Test: `pnpm test` (= `tsx run.ts`, needs a running app — see README). Hermetic run: `pnpm e2e:hermetic` (`../scripts/e2e.sh`, boots its own isolated stack, direct `tsx`, not `pnpm start`/watch). Typecheck: `pnpm typecheck`. Lint: not configured.

## Read when

- adding/changing a flow test → `specs/` holds the `.flow.json` files themselves
- writing/checking the product spec behind a flow → `specs-docs/`
- changing runner internals → `docs/README.md`
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

One flow per file, `specs/NN-kebab-name.flow.json` (`NN` = zero-padded run order); its prose spec belongs under `specs-docs/` by the same basename. Shared step helpers live in `lib/`.

## Do not touch

- `package-lock.json` — never hand-edit; regenerate via `npm install` after a `package.json` change.
