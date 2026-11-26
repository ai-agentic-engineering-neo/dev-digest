# reviewer-core — feature specs

One file per feature: `M<n>-<slug>.md` (e.g. `M1-cost-badge.md`). Read the matching
spec before implementing; update it when the plan changes. Remove or mark as done once shipped.

## Template

```markdown
# M<n> · <Feature name>

## Goal
One or two sentences: what problem this solves and for whom.

## User-visible behaviour
What changes in the UI / API / CLI, step by step.

## Contract & data changes
Zod contracts (`@devdigest/shared`), routes, DB tables, prompt slots touched.

## Out of scope
What this feature deliberately does not do.

## Acceptance
- [ ] Checkable criteria, incl. the tests that prove it.
```
