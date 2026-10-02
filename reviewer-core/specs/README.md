# reviewer-core — specs

One file per feature, written BEFORE implementation: `NNN-<feature>.md` (e.g. `001-cost-badge.md`).

## Index
- `00-cost-usd-contract.md` — how per-call `costUsd` becomes `ReviewOutcome.costUsd` (existing behaviour, consumed by L01).

## Template
```markdown
# NNN — <feature> (Lesson Lxx)
Status: draft | approved | done

## Goal
## Contract (shared schemas · routes · UI)
## Out of scope
## Acceptance criteria
- [ ] …
- [ ] e2e flow: `e2e/specs/NN-<name>.flow.json` (if a user journey changes)
## Links
```
