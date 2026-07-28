# e2e/CLAUDE.md — `@devdigest/e2e`

How a flow works, coverage table: [README.md](README.md). This file only adds
what an agent working in this folder wouldn't guess from the README.

Read [LEARNINGS.md](LEARNINGS.md) before starting work here — treat it as
high-confidence guidance unless it's obviously stale.

## Non-default conventions

- Flows are declarative JSON (`specs/NN-name.flow.json`), a list of
  `agent-browser` CLI commands run in order — not a Playwright/Jest test file.
  New flows follow the existing naming (`NN-name.flow.json`) and step shape.
- Locators are deterministic only: `--url`, `--text`, `find role|text|label`.
  Never use the AI `chat` command — it would make runs non-deterministic and
  reintroduce an LLM dependency this suite is explicitly built to avoid.
- `wait --text` / `wait --url` **are** the assertions (non-zero exit = fail);
  there's no separate `expect()` step.

## Do-not-touch / gotchas

- **Never** `docker compose down -v` to "reset" the dev DB — `-v` deletes the
  `devdigest_pgdata` volume along with every real repo and review imported
  through the studio, not just e2e state.
- Flows `02`/`04`/`05` assume the seeded demo repo (`acme/payments-api`, PR
  #482) is the **only** repo in the DB — running `npm test` against your own
  dev stack (which usually has other imported repos) makes those flows land
  on the wrong repo and fail. Default to the hermetic runner
  (`./scripts/e2e.sh`, isolated Postgres/API/web ports, no persistent volume).
- Failure screenshots land in `e2e/test-results/` (git-ignored, uploaded as a
  CI artifact by `e2e-web.yml`) — check there first when a flow fails in CI.

## Testing

Hermetic (recommended): `./scripts/e2e.sh`. Against your own running stack:
`./scripts/dev.sh` then `cd e2e && npm test` — only safe if the precondition
above holds.

## Read when

- Testing/CI questions: [../TESTING.md](../TESTING.md).
- The future root-level `specs/` (not created yet) is unrelated to this
  package's own `specs/` (flow definitions) — don't confuse the two.

Finishing a substantive task here (bug fix, non-trivial change, discovery)?
Append an entry to [LEARNINGS.md](LEARNINGS.md) — don't skip it.
