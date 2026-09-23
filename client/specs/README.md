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
