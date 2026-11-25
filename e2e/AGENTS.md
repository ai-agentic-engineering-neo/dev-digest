# e2e — `@devdigest/e2e`

Deterministic browser flows over the real stack. Repo-wide rules are in
[../CLAUDE.md](../CLAUDE.md); project overview in [../README.md](../README.md);
flow format, env knobs and coverage in [README.md](README.md). Do not repeat
them here.

## Commands

```sh
../scripts/e2e.sh        # hermetic: own Postgres :5433, API :3101, web :3100
npm test                 # against an already-running stack (see Gotchas)
npm run typecheck
```

One-time setup: `npm i -g agent-browser && agent-browser install`.

## Where things live

- `specs/NN-name.flow.json` — one flow per file, run in filename order
- `specs/M<n>-<feature>.md` — written specs; the runner ignores non-`.flow.json`
- `run.ts` — the runner; `lib/assert.ts` — the stdout assertion helper
- `test-results/` — failure screenshots (git-ignored)

## Conventions

- A flow is a JSON list of agent-browser commands. `wait --text` and
  `wait --url` are the assertions; a non-zero exit fails the flow.
- Use deterministic locators only: `--url`, `--text`, `find role|text|label`.
  Never use the AI `chat` command.
- Flows read seeded data only (`acme/payments-api`, PR #482, seeded agents)
  and must never trigger an LLM call or submit a form that writes real data.
- Number new specs with the next `NN-` prefix. Coverage is typological: add a
  flow for a new main journey, not for every screen state.

## Gotchas

- Use the hermetic runner by default. `npm test` against a normal dev DB fails
  flows 02/04/05, because the home redirect goes to the first repo and a dev DB
  usually has repos other than the seeded one.
- Flows assert on visible text and URLs, so a renamed label or route in
  `client/` breaks them. When a flow fails after a UI change, decide whether the
  UI or the flow is wrong before editing either.
- New seeded data that flows depend on belongs in `server/src/db/seed.ts`, and
  the seed must stay idempotent.

## Do not touch

- Never reset the dev database with `docker compose down -v`; it deletes every
  imported repo and review. The hermetic runner needs no reset.
- Do not add Playwright or another test framework.

## Read when

- Adding or changing a flow → read `README.md`.
- Changing the runner or the hermetic stack → read `docs/architecture.md`.
- Adding a flow for a milestone journey → read `specs/README.md`.
- Changing CI for this suite → read `../TESTING.md` and
  `../.github/workflows/e2e-web.yml`.
- Before starting → read `INSIGHTS.md`; treat it as high-confidence guidance.
- When a task ends or something non-obvious happens → run the
  `engineering-insights` skill (appends to `INSIGHTS.md`).
