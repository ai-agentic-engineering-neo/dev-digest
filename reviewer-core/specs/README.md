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

Contract specs have no number: they describe shipped behaviour that must stay
true (`# <Name> — contract`, then numbered rules, each citing the code and the
test that checks it). Change the code and the contract in the same commit.

- [`grounding-and-scoring.md`](grounding-and-scoring.md) — grounding, score, verdict,
  gate and cost rules.
