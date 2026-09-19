# `e2e/specs/` — the flows

Each `NN-name.flow.json` is one browser journey: a JSON list of agent-browser commands
run in order against a shared session. This folder **is** the specification — the flows
are the executable acceptance criteria, so there is no separate prose spec here.

| Flow | Journey |
|---|---|
| `01-app-boot.flow.json` | app boots and lands on the seeded repo's PR list |
| `02-repo-pulls-detail.flow.json` | repo → PR list → PR detail |
| `03-agents.flow.json` | agents list and editor |
| `04-pr-findings.flow.json` | findings on a reviewed PR |
| `05-pr-diff.flow.json` | the diff view |
| `06-onboarding.flow.json` | add a repository |
| `07-settings.flow.json` | settings sections |

Read [`../README.md`](../README.md) before adding one — locator rules and the
seeded-data precondition are not optional.
