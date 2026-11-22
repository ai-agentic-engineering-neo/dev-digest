# Feature specs

One file per feature, written before implementation: `specs/<milestone>-<feature>.md`
(e.g. `m1-run-cost-badge.md`). Specs live here, not in packages, because most
features span server + shared contracts + client.

## Template

```markdown
# <Feature name> (<milestone>)

## Goal
What the user gets and why — 2–3 sentences.

## Scope
- In: …
- Out (explicitly not doing): …

## Design
- Packages touched: server / client / reviewer-core / shared contracts
- Data: new tables/columns, migrations
- API: routes, request/response contracts
- UI: screens, states (loading / empty / error)

## Acceptance criteria
- [ ] Observable behaviour 1
- [ ] Tests: which suite covers what

## Open questions
- …
```
