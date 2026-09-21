# e2e — docs

How the browser suite is built and run.

**`specs/` here is different from the other packages.** It contains executable flows (`NN-<name>.flow.json`,
JSON lists of agent-browser commands run by `run.ts`), not feature specs. Feature specs live in
`client/specs/` and `server/specs/`; each of those lists the flow it needs under its acceptance criteria.

| File | Read when |
|---|---|
| `overview.md` | Deciding what belongs in a flow, what the suite must never do, and what it depends on (seeded stack, ports). |
| `structure.md` | Locating the runner, the assert helpers, the flow files, screenshots, and the hermetic script. |
| `patterns.md` | Adding or extending a flow, debugging a failing step, running against a stale local DB. |

Run: `npm test` against a running stack (`E2E_BASE_URL`, default `http://localhost:3000`) or `npm run e2e:hermetic`
(`../scripts/e2e.sh`, isolated fresh-seed stack). Naming: `specs/NN-<kebab-name>.flow.json`, executed in lexical order.

Paths in these docs are relative to the package root (`e2e/`); `../` points at the repo root.
