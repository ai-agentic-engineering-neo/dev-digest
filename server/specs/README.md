# server/specs

What we **intend** to build in the API. One file per feature: `NN-feature-name.md`.
A feature that spans API + UI keeps its single spec here; `../../client/specs/`
links to it.

```markdown
# <Feature>
**Status:** draft | agreed | in progress | shipped
## Problem
## Scope            <!-- module under src/modules/, tables, jobs -->
## API / Data       <!-- routes, @devdigest/shared contracts, migrations -->
## Acceptance criteria
```

Contract specs have no number: they describe shipped behaviour that must stay
true (`# <Name> — contract`, then numbered rules, each citing the code and the
test that checks it). Change the code and the contract in the same commit.

- [`review-flow.md`](review-flow.md) — the review cycle from `POST /pulls/:id/review`
  to what every read route returns.
