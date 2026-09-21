# Insights — reviewer-core

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

### `wrapUntrusted` escaped its content but interpolated its label raw (2026-09)

The guard strips `</untrusted>` from the content and then drops the label straight into
`<untrusted source="${label}">`. That was safe while every label was a hardcoded constant
(`diff`, `repo-map`). The skills feature started passing `skill:${name}`, where the name
comes from an imported skill — a name containing a quote and a newline closes the
attribute and plants text immediately after the opening delimiter, in the one section the
model is told is rules.

**Rule:** treat a delimiter's attributes as part of the trust boundary, not decoration.
The label is now whitelisted to `[\w.:/-]` and capped; check this before routing any new
user-controlled string into a prompt slot's label (`src/prompt.ts:37`, commit `933c65c`)

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
