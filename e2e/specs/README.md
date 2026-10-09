# e2e — specs

In this package the specs **are** the user journeys: each `NN-name.flow.json` file is one
deterministic browser flow. The runner only picks up `*.flow.json`, so this README is ignored.

- File name: `NN-short-name.flow.json`; flows run in name order against one browser session.
- Each step: `{ "cmd": [...agent-browser args], "label": "…", "assert"?: { "stdoutIncludes": "…" } }`
- `{BASE}` → `E2E_BASE_URL`. `wait --url` / `wait --text` are the assertions.
- Only deterministic locators; only seeded, read-only data.

Full format and examples: [../README.md](../README.md).
