# e2e/ — @devdigest/e2e

Deterministic browser e2e for the web app, driven by Vercel agent-browser
(CDP, no LLM). Read [../CLAUDE.md](../CLAUDE.md) for the repo-wide picture
first.

## Read when

- How a flow works, hermetic vs. against-your-own-stack runs: read
  [README.md](README.md).
- Deeper architecture notes/decisions beyond the README: read [docs/](docs/).
- Feature/requirement specs (what a flow should cover) before writing one:
  read [specs/](specs/).
- Past gotchas and decisions from earlier sessions: read [INSIGHTS.md](INSIGHTS.md).

## Non-default conventions

- `specs/` here is **product/feature specs**, not test flows — flow
  definitions (`NN-name.flow.json`) live in [`specs_old/`](specs_old/). This
  package used to keep flows at `specs/`; it was renamed to free that path
  for the same Docs/Specs/Insights convention as the other 3 packages.
  `run.ts`'s `SPECS_DIR` already points at `specs_old`.
- Flows target **read-only seeded data** only (`acme/payments-api`, PR #482)
  — never assert against data a flow itself creates.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`)
  — never the AI `chat` command, to keep runs stable and key-free.

## Gotchas

- Running `npm test` against your normal dev DB (not the hermetic stack)
  breaks flows 02/04/05 if you've imported other repos — see the
  precondition note in [README.md](README.md#how-a-flow-works). Prefer
  `./scripts/e2e.sh` / `pnpm e2e:hermetic`.
- Never `docker compose down -v` to "reset" — it deletes the `devdigest_pgdata`
  volume along with every imported repo/review.

## Do-not-touch

- Nothing vendored in this package.

## Commands

`npm test` (against a running dev stack) · `npm run e2e:hermetic` (isolated
stack, recommended) · `npm run typecheck`
