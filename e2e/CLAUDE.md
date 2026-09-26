# e2e — agent map

`@devdigest/e2e`: deterministic browser flows for the web app, driven by the
Vercel agent-browser CLI (Rust + CDP). No Playwright, no LLM, no API key. The
flow format and the env knobs are in README.md.

## Before answering

Always search the relevant package's `docs/` and `INSIGHTS.md` for what the user
asks about FIRST — these are curated and may already answer it — then read code.
(`specs/` in this package holds flow JSON, not written specs.)

## Non-default conventions

- A flow is a JSON list of agent-browser commands in `specs/NN-name.flow.json`;
  `run.ts` executes them in order against one shared browser session.
- Deterministic locators only: `--url`, `--text`, `find role|text|label`. The AI
  `chat` command is banned — it makes runs unstable and requires a key.
- `wait --text` / `wait --url` *are* the assertions: a non-zero exit fails the
  step and the flow.
- Installs with **npm**, not pnpm. Requires the CLI once:
  `npm i -g agent-browser && agent-browser install`.
- `specs/` in this package means browser flows (`*.flow.json`), **not** written
  feature specs. Written specs go in `docs/`.
- Flows run against read-only seeded data. Nothing here may trigger a model call.

## Non-obvious behavior

- Flows 02 / 04 / 05 follow the home redirect to the *first* repo, so they
  assume the seeded demo repo is the only one. Against your own dev DB they land
  on the wrong repo and fail. Use `./scripts/e2e.sh`, which boots an isolated,
  freshly seeded stack on ports 5433 / 3101 / 3100 and leaves your dev DB alone.
- Failure screenshots land in `test-results/` and are uploaded by CI.

## Do-not-touch

- `test-results/**` — generated output.
- Never run `docker compose down -v` to "reset" the dev DB: `-v` deletes the
  `devdigest_pgdata` volume along with every imported repo and review.

## Read when

- Read `README.md` before writing or changing a flow — flow format, env knobs
  and the coverage table are there.
- Read `docs/flow-authoring.md` before writing or debugging a flow — runner
  mechanics, why exit codes are the assertions, locator rules.
- Read `docs/coverage-spec.md` before changing a flow or the seed — it states
  what each flow pins and what is deliberately not covered.
- Read `../TESTING.md` before adding or changing a test anywhere in the repo.
- Read `INSIGHTS.md` before starting non-trivial work here.
- Write feature specs into `docs/`, not `specs/` — that folder holds flow JSON
  (`specs/behaviour-spec.md` is only a pointer to `docs/coverage-spec.md`).

Found a trap that cost you time? Capture it with the `engineering-insights`
skill, which appends it to `INSIGHTS.md`.
