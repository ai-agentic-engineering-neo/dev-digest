# @devdigest/reviewer-core

The review engine: diff → prompt → LLM → grounded findings.

## Read when

- **Understanding the pipeline or the public API** → read `README.md` (has the diagram).
- **Adding a prompt slot or changing assembly order** → read `docs/prompt-assembly.md`.
- **Touching the citation gate or scoring** → read `docs/grounding.md`.
- **Starting a task in this module** → read `specs/`.
- **Debugging something that smells familiar** → read `INSIGHTS.md`; run the
  `engineering-insights` skill at the end of the task to add to it.

## The invariant

ZERO I/O. No database, no GitHub, no filesystem, no `process.env`.
The only side effect is the injected `LLMProvider`.
Need outside data? Add a field to `ReviewInput` — never add an import.

## Rules

- The package emits no JS. `build` is `tsc --noEmit`; consumers read the source.
- `INJECTION_GUARD` in `prompt.ts` is the single hardening point for every review
  path. Defenses belong there, not in pattern matching further downstream.
- Any externally sourced text in a prompt must go through `wrapUntrusted()`.
- A new prompt slot must omit its section entirely when empty or undefined, so the
  assembled prompt stays byte-identical to the pre-feature shape.
- The score is recomputed deterministically from findings that survived grounding.
  The model's own verdict is not a source of truth.

## Gotchas

- The tsconfig aliases `zod` to this package's own `node_modules`. That duplicate
  instance is intentional — do not "fix" it.
- `FULL_FILE_KINDS` in `grounding.ts` bypasses the line-intersection check.
  Extend that set only with a deliberate reason.
