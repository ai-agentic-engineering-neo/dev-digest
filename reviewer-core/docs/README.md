# reviewer-core — docs index

Deeper design notes for `reviewer-core/`, one topic per file. The package `README.md` stays the canonical overview;
put here what is too detailed for it. Add each new doc to the list below with a one-line "read when".

<!-- - [topic.md](topic.md) — read when … -->
- [pipeline.md](pipeline.md) — read when changing mode selection, chunking/map-reduce, prompt section order, reduce, grounding, scoring or progress events in `reviewPullRequest`
- [providers-and-cost.md](providers-and-cost.md) — read when touching an `LLMProvider`, structured-output repair/retries, `sessionId`, or token/USD accounting (`onUsage`, `costUsd` null-propagation)

Contract (what callers may rely on): [`../specs/review-engine.md`](../specs/review-engine.md).
