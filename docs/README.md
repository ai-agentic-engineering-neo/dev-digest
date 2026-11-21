# DevDigest — docs

Repo-level documentation: what spans packages. Anything that belongs to one
package lives in that package's own `docs/` and `specs/`. Project overview and
quick start are in the [main README](../README.md).

## Repo-level

| Doc | Read when |
|-----|-----------|
| [architecture.md](architecture.md) | changing how packages depend on each other, or how a review flows across them |
| [agent-prompts/](agent-prompts/README.md) | editing reviewer system prompts or choosing a model |
| [../TESTING.md](../TESTING.md) | writing tests or touching CI |

## Per package

| Package | README | Docs | Architecture | Specs | Insights | Learnings |
|---------|--------|------|--------------|-------|----------|-----------|
| `server/` | [README](../server/README.md) | [docs](../server/docs/README.md) | [architecture](../server/docs/architecture.md) | [specs](../server/specs/README.md) | [insights](../server/INSIGHTS.md) | [learnings](../server/LEARNINGS.md) |
| `client/` | [README](../client/README.md) | [docs](../client/docs/README.md) | [architecture](../client/docs/architecture.md) | [specs](../client/specs/README.md) | [insights](../client/INSIGHTS.md) | [learnings](../client/LEARNINGS.md) |
| `reviewer-core/` | [README](../reviewer-core/README.md) | [docs](../reviewer-core/docs/README.md) | [architecture](../reviewer-core/docs/architecture.md) | [specs](../reviewer-core/specs/README.md) | [insights](../reviewer-core/INSIGHTS.md) | [learnings](../reviewer-core/LEARNINGS.md) |
| `e2e/` | [README](../e2e/README.md) | [docs](../e2e/docs/README.md) | [architecture](../e2e/docs/architecture.md) | [specs](../e2e/specs/README.md) | [insights](../e2e/INSIGHTS.md) | [learnings](../e2e/LEARNINGS.md) |

## Where a new document goes

- About one package → that package's `docs/`.
- About a feature to build → the `specs/` of each package it touches.
- About how packages interact → here.
- A lesson learned while working → that package's `LEARNINGS.md`, through the
  `engineering-insights` skill.
- A lasting fact about a package that the code does not show → its `INSIGHTS.md`.
- A rule the agent must always follow → the nearest `CLAUDE.md`, as one line
  with a pointer to the doc that explains it.
