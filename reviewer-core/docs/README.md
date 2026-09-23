# reviewer-core/docs

Deeper documentation for the review pipeline (`diff → prompt → LLM →
findings`) that we deliberately keep out of `CLAUDE.md`. `CLAUDE.md` links
here — read only when the task actually needs it (e.g. how `groundFindings`
works internally, the exact prompt format).

## Contents

- [prompt-assembly.md](./prompt-assembly.md) — `assemblePrompt()`,
  `wrapUntrusted()`, `INJECTION_GUARD`, and why the guard isn't a keyword filter.
