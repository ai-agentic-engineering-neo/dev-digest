# client specs

Feature specifications for the **studio** UI: what each screen must do, its
acceptance criteria, and its edge cases. Specs describe the intended behavior;
the code and the tests are how that behavior is checked.

For how the app is built and run, see [`../docs/README.md`](../docs/README.md)
and [`../README.md`](../README.md). For agent rules, see [`../CLAUDE.md`](../CLAUDE.md).

## What belongs here

- One spec per feature or screen, for example the PR list, the diff view, or the agent editor.
- Each spec states the **goal**, the **user-visible behavior**, **acceptance criteria**,
  and **out of scope** items.
- Behavior the API must provide, referenced by endpoint, not re-specified.

## What does not belong here

- Setup and architecture → `docs/`
- Dated decisions and gotchas → `../insights.md`
- Implementation detail that will change with the code

## Template

```markdown
# <Feature name>

**Route:** `/repos/:repoId/pulls`
**Status:** draft | accepted | shipped

## Goal
One or two sentences on what the user can do after this ships.

## Behavior
- What the user sees and does, in order.

## Acceptance criteria
- [ ] Given …, when …, then …

## Out of scope
- …
```

## Index

_Empty for now. Add a line per spec as it is written, for example:_
- `pr-list.md` — PR list per repo, filters, import
- `review-run.md` — running and reading an agent review
- `cost-badge.md` — cost per run and per PR in the PR list, Agent runs card and run drawer
