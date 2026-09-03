# Insights — reviewer-core

Engine decisions and dead ends. Read before changing prompt assembly, structured
output, or grounding — the constraints here are deliberate.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-08-21 — Removed map-reduce chunking; every review is single-pass

**What:** `reviewPullRequest` no longer splits a large diff into per-file
chunks (`mapWithConcurrency`, `selectMode`, `isLargeDiff`, `tooBigForModel`,
`ReviewStrategy`/`ReviewMode`, `reduceReviews`/`sliceDiff` — all removed from
`review/run.ts` and `review/reduce.ts`). One LLM call over the whole diff,
always. `agent.strategy` still exists as a DB/API field (server agents
module, Agent Editor UI) but the engine no longer reads it — set-but-ignored,
left for a later pass.
**Why:** reviewing one file per call meant a chunk could never see a
compensating change in a sibling file — a type signature broadened in file A
with its call sites updated in file B each looked incomplete in isolation.
This was the direct cause of a recurring class of false CRITICAL findings
("transaction parameter added without visible caller updates", "no evidence
of implementation") that survived across multiple stronger-model attempts
(gemini-2.5-flash-lite → claude-haiku-4.5) because the blind spot was
structural, not a model-quality problem — see the root `INSIGHTS.md` entries
on the cross-file blind spot. Manually dismissing each recurrence in the
review UI didn't fix anything systemic; removing the chunking that caused it
does.
**Rejected:** keeping chunking and teaching grounding to be cross-file-aware
(e.g. pass every changed file's diff to every chunk for context) — much more
invasive, still probabilistic (the model would have to actually use the
extra context correctly), and diagnosed after the fact each time regardless.
Also rejected: keeping chunking only for diffs above a size threshold — the
threshold was exactly the case-by-case unpredictability we were trying to
eliminate. Accepted trade-off: a diff that overflows the model's context
window, or produces enough findings to truncate the structured-output JSON,
now fails outright instead of being chunked around — judged acceptable given
current PR sizes; revisit if that starts happening in practice.

### 2026-08-21 — All-chunks-failed in map-reduce throws, doesn't degrade silently

**Superseded the same day** by the decision above — map-reduce (and
`reduceReviews`, the function this decision's "empty partials" scenario
depended on) no longer exists, so this specific throw is gone. The
UNDERLYING property it protected — a total LLM failure must never look like a
clean 100/approve review — still holds for single-pass: an LLM error now
propagates directly out of `reviewPullRequest` uncaught (nothing catches and
degrades it), which is the same "fail loudly" contract, just with no
chunk-failure state machine to reproduce it in. Kept below for the reasoning
trail.

**What:** in `reviewPullRequest`'s map-reduce path, if every chunk's LLM call
fails, the engine now throws (`All N map-reduce chunk(s) failed — review could
not be completed`) instead of continuing.
**Why:** `reduceReviews([])` → 0 findings → `scoreFromFindings([])` = 100,
verdict `approve` — a total LLM outage (bad credentials, rate limit) was
indistinguishable from a genuinely flawless PR. Single-pass already throws on
its one failure; map-reduce's all-fail case is the same situation and needed
the same contract. `server/.../run-executor.ts`'s existing catch block already
persists a `failed` run + error message, so no caller change was needed.
**Rejected:** keeping the silent-degrade and just emitting an `info` log event
(the pre-existing behavior) — the event is easy to miss and the persisted
review still reads as "0 findings, approved."

### 2026-07-31 — Mechanical grounding gate, not a trusted model

**What:** every finding must cite a real line in the diff or it is dropped, and
the verdict score is recomputed from the surviving findings.
**Why:** the model reliably invents plausible line references, and a citation
check is verifiable where a self-reported confidence is not.
**Rejected:** trusting the model's own locations and score. Findings pointed at
lines that were not in the diff, and the score did not move when they were
removed.

### 2026-08-21 — All-chunks-failed in map-reduce throws, doesn't degrade silently

**What:** in `reviewPullRequest`'s map-reduce path, if every chunk's LLM call
fails, the engine now throws (`All N map-reduce chunk(s) failed — review could
not be completed`) instead of continuing.
**Why:** `reduceReviews([])` → 0 findings → `scoreFromFindings([])` = 100,
verdict `approve` — a total LLM outage (bad credentials, rate limit) was
indistinguishable from a genuinely flawless PR. Single-pass already throws on
its one failure; map-reduce's all-fail case is the same situation and needed
the same contract. `server/.../run-executor.ts`'s existing catch block already
persists a `failed` run + error message, so no caller change was needed.
**Rejected:** keeping the silent-degrade and just emitting an `info` log event
(the pre-existing behavior) — the event is easy to miss and the persisted
review still reads as "0 findings, approved."
`src/review/run.ts:300` (throw); `test/run.test.ts` ("map-reduce chunk
failures" describe block).

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

- **2026-08-21** — the citation-grounding gate (`groundFindings`) verifies a
  finding's `file:line` exists in the diff, but never verifies the finding's
  *quoted content* at that location. A cheap model (gemini-2.5-flash-lite)
  reported a "hardcoded Stripe secret `sk_live_xxx`" finding citing a real
  line whose diff hunk shows `sk_live_xxx` only on the removed (`-`) side,
  replaced by a placeholder on the added (`+`) side — a real citation, false
  claim about current content. Confirmed as a hallucination by reading the
  actual file (`grep` showed no `sk_live_xxx` anywhere outside `-` lines).
  Location-only grounding cannot catch this class of error; content
  verification would need to diff the model's quoted excerpt against the
  actual hunk text. Not fixed — `grounding.ts`'s citation gate is
  do-not-touch without sign-off (`reviewer-core/CLAUDE.md`).
  - **2026-08-21** — Same gap, worse outcome, stronger model: switching the
    Security Reviewer to `anthropic/claude-haiku-4.5` (from the flash-lite
    default) didn't close this — it used the extra capability to construct a
    `kind: 'lethal_trifecta'` finding that survived `hasCompleteTrifectaEvidence`
    entirely, citing `reviewer-core/INSIGHTS.md:41-92` (this very entry,
    describing the flash-lite hallucination above) as the "vulnerability."
    Every cited `file:line` was real, so citation-only grounding had nothing
    to reject. The actual defect: grounding never asks whether the CITED FILE
    is even the kind of artifact `lethal_trifecta` can apply to — a `.md`
    doc has no untrusted-input path, no private-data access, and no exfil
    path; it cannot structurally satisfy the pattern regardless of what text
    it contains. A cheap content-blind mitigation matching this specific
    case: exclude non-source paths (`.md`, `.json`, migration SQL) from
    `FULL_FILE_KINDS` eligibility in `grounding.ts`, or require at least one
    evidence entry per trifecta claim to fall in a file with an extension the
    system actually executes/serves. Not implemented — same do-not-touch
    constraint as above.
