# reviewer-core docs

Deeper documentation for `reviewer-core` — architecture notes, design
decisions, or subsystems that need more explanation than the top-level
`README.md` gives — as `docs/<topic>.md`.

- [review-pipeline.md](review-pipeline.md): `reviewPullRequest` step by step: mode selection, the chunk loop, reduce, the grounding gate, the deterministic score, and events.
- [llm-provider-and-cost.md](llm-provider-and-cost.md): the `LLMProvider` contract, OpenRouter structured output and retries, and how cost is sourced and combined (one unknown makes it `null`).
