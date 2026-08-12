# reviewer-core — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-08-12 — activating a long-reserved optional prompt slot (`specs`) needs a grep of consumers OUTSIDE this package too, not just `reviewer-core/src` + `reviewer-core/test`

specs/09-project-context-folder.md widened `PromptParts.specs` /
`ReviewInput.specs` from `string[]` to `{ path: string; content: string }[]`
(`prompt.ts`, `review/run.ts`) so each document's repo-relative path travels
with its content as the `wrapUntrusted` label (AC-15/AC-25). The plan
justified this as safe with "zero producers exist today — grep confirms the
only mentions are the type, the renderer, and `run-executor.ts`'s `specs:
null`" — but that grep was scoped to `reviewer-core` itself and missed two
**server-side** test files that call `assemblePrompt`/`wrapUntrusted`
directly via `@devdigest/reviewer-core` (or its `server/src/platform/
prompt.ts` re-export shim): `server/test/prompt-callers.test.ts` and
`server/test/prompt-structured.test.ts`, both still passing the old
`specs: ['some string']` shape. Because reviewer-core's own `tsc` only
type-checks `reviewer-core/src` + `reviewer-core/test`, this compiled clean
there and only broke at `server`'s test runtime — `parts.specs.map(d =>
wrapUntrusted(d.path, d.content))` treats each string as `{path: undefined,
content: undefined}`, and `wrapUntrusted`'s new label-sanitizer
(`label.replace(...)`) throws a `TypeError` on `undefined`. Lesson: before
widening/narrowing a `reviewer-core` export's shape, grep `server/test/**`
and `server/src/**` too (anything importing `@devdigest/reviewer-core` or the
`platform/prompt.ts` shim) — "reviewer-core is a pure engine with no
producers yet" can still be false one layer out, in a consumer's tests.

### 2026-08-12 — `wrapUntrusted`'s label is now attacker-influenceable; sanitize it before interpolating

Every `wrapUntrusted(label, content)` call before specs/09 used a hardcoded
label constant (`'diff'`, `'repo-map'`, `'pr-description'`, …). The Project
Context Folder feature makes the label a **repository-controlled path**
(`d.path` from the resolved document), and the wrapper interpolated it
verbatim into `source="${label}"` with no escaping — a path containing `"`
or `>` could close the attribute early and inject markup into the prompt
just outside the untrusted boundary. Fixed by stripping `"`, `<`, `>`, CR,
LF from the label before interpolating (`sanitizeLabel` in `prompt.ts`) —
content escaping (`</untrusted>` neutralization) was already correct and is
unchanged. Any FUTURE new `wrapUntrusted` caller that derives its label from
anything other than a hardcoded string constant must sanitize it the same
way; the function itself now does this for every caller, so no caller-side
fix was needed beyond this one change.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
