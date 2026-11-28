# e2e/ — `@devdigest/e2e` (deterministic browser flows)

Module guide. Root map: [../CLAUDE.md](../CLAUDE.md).

Flows drive the real web app through the agent-browser CLI (CDP, no LLM) against
a seeded stack, so nothing triggers a model call.

## Read when

- Any e2e task → first read [INSIGHTS.md](INSIGHTS.md) (agent-written lessons).
- How a flow works, hermetic vs own stack, coverage → [README.md](README.md)
- Test strategy across modules → [../TESTING.md](../TESTING.md)
- Deeper notes and feature plans → [docs/](docs/)

## Layout

```
specs/*.flow.json   the flows themselves (this module's "specs/" = test specs, not feature specs)
lib/assert.ts       assertions used by flows
run.ts              runner
```

## Commands (run inside `e2e/`, package manager is **npm**)

```sh
npm run typecheck
npm run e2e:hermetic   # isolated stack on :5433/:3101/:3100, safe next to your dev stack
npm test               # against your own running stack
```

## Conventions

- Flows must be deterministic: rely on seeded data (`server/src/db/seed.ts`),
  never on a live model or GitHub.
- A UI text or route change in `client/` can break a flow — grep `specs/` for
  the string before renaming it.
