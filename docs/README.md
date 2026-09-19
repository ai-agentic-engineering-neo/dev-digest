# `docs/` — cross-package documentation

Stable explanations that outlive a single change: architecture, decisions and the
trade-offs behind them. Anything here is the source of truth — `CLAUDE.md` files point
at these documents rather than restating them.

Not for: volatile data, task-level detail (that is `specs/`), or debugging lore
(that is `INSIGHTS.md`).

| Document | What it covers |
|---|---|
| [`agent-prompts/`](agent-prompts/README.md) | The reviewer system prompts and how to choose a model |

When you add a document here, add a row above and a `Before answering` row in the root
[`CLAUDE.md`](../CLAUDE.md) if an agent should read it before working on that topic.
