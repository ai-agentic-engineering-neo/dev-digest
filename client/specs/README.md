# client/specs

What we **intend** to build in the UI. One file per feature: `NN-feature-name.md`.
If the feature also needs a new endpoint, keep one spec in `../../server/specs/`
and link it from here.

```markdown
# <Feature>
**Status:** draft | agreed | in progress | shipped
## Problem
## Scope            <!-- route(s) under src/app/**, components -->
## API / Data       <!-- hook in src/lib/hooks, endpoint, @devdigest/shared types -->
## Acceptance criteria
```

Contract specs have no number: they describe shipped behaviour that must stay
true (`# <Name> — contract`, then numbered rules, each citing the code and the
test that checks it). Change the code and the contract in the same commit.

- [`pages.md`](pages.md) — every route, its data and URL params, the Agent runs tab,
  and the copy e2e flows assert.
