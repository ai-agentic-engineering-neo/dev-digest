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

### 2026-09-10 — feeding `assemblePrompt` a RAW unified diff makes every `start_line` a guess, and `groundFindings` cannot catch it on a whole-file addition

Until this date `assemblePrompt` pushed `parts.diff` (= `input.diff.raw`, straight
from GitHub's diff media type) into the prompt verbatim. A unified diff carries
exactly one coordinate — the `@@ … +newStart,newLines @@` header — so a model asked
for `Finding.start_line` has to COUNT from that header to the line it wants. It
drifts. Measured on burnjohn/quick-blog PR #31 (`f9d44c3`), file
`server/src/controllers/analyticsController.js`, 726 lines added as ONE hunk: the
Spec Conformance agent's citations were low by 28 lines near the top of the file and
by 211 near the bottom, monotonically — an accumulating undercount, not noise. Real
line 708 (`console.log('[analytics] auth header:' …)`) was cited as 497; 696 as 490;
577 as 448. In small files the same agent was accurate to ±2, which is the tell:
the error scales with the length of the count, not with the file.
Two amplifiers made it invisible:
1. `groundFindings` (`grounding.ts`) only checks that `[start_line, end_line]`
   intersects SOME hunk of that file. A file added whole is one hunk covering every
   line, so any number in `1..726` passes — for new files the gate degrades to
   "the file is in the diff" and proves nothing about the line.
2. `resolveCommentLine` (`output/to-review.ts`) then snaps the citation to the
   nearest anchorable diff line, so the wrong number posts successfully as an inline
   comment instead of failing loudly (it exists to prevent GitHub 422 on the whole
   review — correct, but it also launders a bad citation).
Same root cause as the older `:1` symptom: an agent prompt that did NOT demand a
real line got `line: null` / `:1` everywhere (the model declining to count), and one
that DID demand it got confident wrong numbers (the model counting and drifting).
Fixed by `numberDiffLines` (`diff-format.ts`), applied inside `assemblePrompt`:
each new-side line is prefixed with the number it will have to cite, so reading
replaces counting; removed lines get blank padding; text with no hunk header (the
slot also accepts a plain task) passes through untouched, and the accompanying
"read the number, never estimate it" sentence is then omitted too. Verified against
the real PR #31 diff — all six previously-wrong citations render at their true line.
Cost: +9.3 % characters on the diff block (~4–5k tokens on that PR).

### 2026-09-10 — the prompt's line numbers and the grounding gate's line index are derived by two parsers that cannot import each other; only a test keeps them honest

`numberDiffLines` (reviewer-core) and `buildLineIndex` (reviewer-core, fed by
`parseUnifiedDiff`) must agree on which diff lines consume a new-side number, or the
prompt advertises citations the gate then drops. They cannot share code: the parsers
live in `agent-runner/src/diff.ts` and `server/src/adapters/git/diff-parser.ts` —
reviewer-core is a pure engine and imports neither, and agent-runner's ncc bundle must
stay self-contained. So `numberDiffLines` mirrors their classification by hand
(`+` but not `+++` → added; `-` but not `---` → removed, unnumbered; anything else
inside a hunk → context) INCLUDING the trailing-`''`-from-`split('\n')` pop, and the
invariant is pinned from the agent-runner side in `diff.test.ts`
("numberDiffLines ↔ buildLineIndex"). It holds in ONE direction only: every number
rendered is one the gate accepts, but not every line the gate accepts gets rendered —
`buildLineIndex` expands a hunk with no new-side lines (a deletion-only hunk, e.g.
`@@ -5,3 +4,0 @@`) to its declared range, covering a position where no line exists, and
the renderer has nothing to print there. Asserting the symmetric version looks right and
is wrong; it passes only until someone adds a deletion-only fixture. The honest second
assertion compares the rendered set against the parser's own `newLineNumbers`, not
against the index. `buildLineIndex` had to
be added to `reviewer-core/src/index.ts`'s exports for that test — agent-runner's
vitest alias maps the bare package name only, so a subpath import
(`@devdigest/reviewer-core/grounding.js`) does NOT resolve there. If you change line
classification in any of the three places, that test is what fails.

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

### 2026-08-13 — `INJECTION_GUARD` was module-private for a whole feature (specs/09) before anything outside `assemblePrompt` needed it

specs/10-onboarding-generator.md's onboarding module makes its own one-off
structured LLM call (server-side, outside the PR-review path — D9) that
handles the SAME class of untrusted repo-controlled input `assemblePrompt`
does (paths, script strings, route strings). Rather than writing a second
guard paragraph (which `server/CLAUDE.md`'s "one shared guard, not denylists"
rule exists to prevent), the fix was exporting the existing
`const INJECTION_GUARD` in `prompt.ts` (`export const`) and adding it to this
package's `index.ts` export list — the guard STRING itself is byte-identical,
`assemblePrompt` is untouched, and `test/prompt.test.ts` needed zero edits.
Consumed from the server via the existing `platform/prompt.ts` re-export shim
(which already re-exported `wrapUntrusted`), so the server module never
imports `reviewer-core/src/prompt.ts` directly. Lesson for the next
server-side feature that makes its own structured call outside the review
path but handles equally-untrusted repo content: check whether
`INJECTION_GUARD` (now exported) already covers it before writing new guard
text — duplicating the paragraph is the failure mode "one shared guard" is
meant to prevent, and the export makes reuse a one-line append (`+
INJECTION_GUARD` on the system prompt), not a new file.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

### 2026-09-07 — `assemblePrompt`'s `## Skills / rules` section is the only optional prompt slot NOT wrapped in `wrapUntrusted`, and `INJECTION_GUARD`'s own text doesn't name it

Verified directly (`src/prompt.ts`, ~line 176) while implementing specs/15-skill-eval-cases.md's R6 check: `if (skillsBlock) userSections.push(`## Skills / rules\n${skillsBlock}`);` pushes the rendered skill blocks straight into the user message with no `wrapUntrusted(...)` call, unlike every other slot in the same function — `pr-description`, `intent`, `intent-scope`, `repo-map`, `specs` (per-doc), `callers`, and `diff` are all wrapped. `INJECTION_GUARD`'s own enumerated list of `<untrusted>` content ("the diff, PR title/description, code comments, README, derived intent/scope") doesn't mention skills either. This is a pre-existing gap affecting every real agent run that injects ANY skill (L02+), not something specs/15 introduced — it just never surfaced because nothing before specs/15 asked this question directly (specs/15's R6 named it as a thing to verify before claiming its own AC-50, not to fix). Deliberately not patched here: it's out of specs/15's scope (`reviewer-core` is a consumer-only dependency for that spec) and `reviewer-core/CLAUDE.md`'s do-not-touch covers `INJECTION_GUARD`. Whoever next touches `assemblePrompt` or does a security pass on skill injection should wrap `skillsBlock` the same way `specsBlock` is wrapped (per-block, since `parts.skills` is already an array of separately-sourced bodies) and update `INJECTION_GUARD`'s own enumerated list to name skills explicitly.
