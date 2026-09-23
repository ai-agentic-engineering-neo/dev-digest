# e2e/specs — executable flows, not written specs

Every `NN-name.flow.json` here is run by `../run.ts` in filename order; the
runner ignores this README. Written specs go in `../docs/`.

Adding a flow:

- Next free number, e.g. `08-name.flow.json`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`) —
  never the AI `chat` command.
- Read-only against seeded data; nothing that writes or calls a model.
- Verify with `npm run e2e:hermetic`, not against your dev DB.

Exception: [`flows.md`](flows.md) is prose — the written contract of these flows
(journeys, seed data, exact copy asserted). `run.ts` loads only `*.flow.json`.
