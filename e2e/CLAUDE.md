# e2e — @devdigest/e2e

Deterministic browser flows driven by Vercel agent-browser. The root `CLAUDE.md` applies.

## Use when

- Adding or fixing a flow → read `README.md` (flow format, locators, hermetic runner)
- A flow fails locally but passes in CI → read `README.md` § *Precondition*: your dev DB has repos
  beyond the seeded one
- Reaching for a locator, a key, a model call or a flow that mutates data, or wondering why a
  scenario is not covered here at all → read `docs/01-determinism-by-construction.md`
- Before relaxing any of that → read `specs/2026-09-22-suite-contract.md`: it states which of the
  suite's properties a mechanism actually protects and which rest on review alone
- Something surprised you, or a fix was not obvious → `INSIGHTS.md`, through the
  `engineering-insights` skill, which carries the format and the rules
- Need depth the README does not give → `docs/`

## Rules not visible from any single file

- `specs/` here holds `NN-name.flow.json` **test flows**. A feature's spec lives with the package
  it changes — `server/specs/`, `client/specs/`, `reviewer-core/specs/` — or in the
  repository-root `specs/` when it spans more than one.
  Beside the flows sits this package's own behaviour spec, `YYYY-MM-DD-<kebab>.md` — what must stay
  true of the suite itself, which is a different thing from a feature of the app.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`). Never the AI `chat`
  command — runs must stay stable and key-free.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, the seeded agents). Nothing here
  may trigger a model call.
- Run through `./scripts/e2e.sh` (isolated stack on :5433 / :3101 / :3100). `pnpm test` against your
  own dev stack fails any flow that follows the home redirect, unless the seeded repo is the only
  one in the DB.
- Never `docker compose down -v` to "reset" a DB — it deletes the `devdigest_pgdata` volume with
  every imported repo and review.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once, downloads Chrome for Testing
./scripts/e2e.sh                                  # or: pnpm run e2e:hermetic
```
