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
