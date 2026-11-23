---
type: llm
focus: trace
weight: 1
---

The answer adds a mock in adapters/mocks.ts for tests and reads the Slack token through SecretsProvider rather than process.env.
