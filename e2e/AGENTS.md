# e2e/CLAUDE.md

Map for `@devdigest/e2e`. Root map: [../CLAUDE.md](../CLAUDE.md). Deep dive: [README.md](README.md).

## Role

Deterministic browser end-to-end flows over the real running stack, driven by
Vercel **agent-browser** (Rust + CDP) — no Playwright, no LLM, no API key.

## Run / test

```sh
../scripts/dev.sh                              # full stack must be running first
npm i -g agent-browser && agent-browser install
npm test                                       # runs run.ts
npm run typecheck
```

## Non-default conventions

- Each flow is a JSON command list in `specs/NN-name.flow.json`, run in order
  against one shared browser session by `run.ts` — flows are data, not code.
- Locators are limited to `--url` / `--text` / `find` — deterministic only.

## Learnings

Read [`INSIGHTS.md`](INSIGHTS.md) before starting work here — if it has
entries, note the ones relevant to this task before proceeding.

## Gotchas

- Never use agent-browser's AI `chat` command in a spec — it's non-deterministic
  and defeats the point of this suite (no LLM in the loop).
- Specs assume seeded demo data from `server/src/db/seed.ts`; reseed if a flow
  starts failing on missing fixtures.

## Do not touch

- `package-lock.json`.
