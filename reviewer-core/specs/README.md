# reviewer-core/specs

What we **intend** to change in the engine. One file per feature:
`NN-feature-name.md`. If the server must pass new inputs, link the matching spec
in `../../server/specs/`.

```markdown
# <Feature>
**Status:** draft | agreed | in progress | shipped
## Problem
## Scope            <!-- prompt slot, gate, reducer, provider -->
## API / Data       <!-- src/index.ts exports, @devdigest/shared contracts -->
## Acceptance criteria   <!-- incl. hermetic tests with a stubbed LLMProvider -->
```
