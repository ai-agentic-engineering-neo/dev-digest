# docs/ — cross-cutting documentation

Documentation that spans more than one package. Anything that belongs to a
single package lives in that package's own `README.md` instead.

| Document | Read when |
|---|---|
| [architecture.md](architecture.md) | You need the call path through the layers, the review-run lifecycle, or where state lands. |
| [agent-prompts/](agent-prompts/) | You're writing or editing an agent's system prompt, or choosing a model. |

## What goes here

- Cross-package flows (a request crossing client → server → engine).
- Design decisions with consequences in more than one package.
- Anything a `CLAUDE.md` wants to point at with "read when …" rather than
  restate inline.

## What does not

- Package-internal detail → that package's `README.md`.
- Lessons learned while working → the module's `LEARNINGS.md`.
- Feature specifications → [`../specs/`](../specs/).
- Anything an agent should load *every* session → a `CLAUDE.md`, kept short.
