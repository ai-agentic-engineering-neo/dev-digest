# DevDigest architecture — where to read it

The module READMEs are the single source of truth for architecture; this page
only routes you to the right one.

- **System overview** — studio diagram (web ↔ API ↔ Postgres ↔ engine) and the
  review flow end to end → [`../README.md#architecture`](../README.md#architecture)
- **Request & DI flow, API map, environment** (server) → [`../server/README.md`](../server/README.md)
- **UI route map** and the API surface each route leans on (client) → [`../client/README.md`](../client/README.md)
- **Review pipeline** — prompt assembly, injection guard, structured output,
  grounding gate (reviewer-core) → [`../reviewer-core/README.md`](../reviewer-core/README.md)
- **repo-intel** — the indexer behind the *Indexed* badge that feeds the repo
  map into reviews → [`../server/src/modules/repo-intel`](../server/src/modules/repo-intel)
- **Reviewer agent system prompts** → [`agent-prompts/`](agent-prompts/README.md)
- **Testing strategy** (suites, CI workflows, Docker needs) → [`../TESTING.md`](../TESTING.md)

Deeper module-level notes live in each module's `docs/` folder.
