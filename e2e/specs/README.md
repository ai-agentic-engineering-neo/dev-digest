# Flow specs

Each `NN-name.flow.json` in this folder is one browser flow. Files run in lexical order, sharing a single browser session. How the harness executes them: [../docs/runner.md](../docs/runner.md).

## Format

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],         "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "root redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],  "label": "seeded PR row visible" }
  ]
}
```

- `cmd` is passed verbatim to `agent-browser`; `{BASE}` becomes `E2E_BASE_URL`.
- `label` is what the report prints for the step.
- Optional `assert.stdoutIncludes` adds a substring check on the command's stdout.
- A non-zero exit fails the step and the flow, so `wait --text` and `wait --url` serve as the assertions.

## Rules for a new flow

1. Deterministic locators only: `--url`, `--text`, `find role|text|label`. Never the AI `chat` command.
2. Read-only against seeded data. A flow must not create, edit, or delete anything another flow reads.
3. No LLM call, no GitHub token, no network dependency beyond the local stack.
4. Cover a *journey*, not a component — component behaviour belongs in the client's vitest suite.
5. Number the file so it runs after any flow whose page state it relies on.

## Coverage

| Spec | Journey |
|------|---------|
| `01-app-boot` | root redirects to the first repo's PR list, seeded PR visible |
| `02-repo-pulls-detail` | PR list → open the seeded PR → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR → agent runs tab → seeded verdict and findings → expand a finding |
| `05-pr-diff` | PR → files changed tab → seeded file renders in the diff viewer |
| `06-onboarding` | `/onboarding` renders the add-repository form, no submit |
| `07-settings` | settings sections render |

Coverage is typological, not exhaustive: one flow per journey that can break, and nothing beyond that.

## Precondition

Flows `02`, `04`, and `05` follow the home redirect to the **first** repo, so the seeded demo repo must be the only repo. Run them through `../../scripts/e2e.sh`, which provides an isolated, freshly seeded stack.
