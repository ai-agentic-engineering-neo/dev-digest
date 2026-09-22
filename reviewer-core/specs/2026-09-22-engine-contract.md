# Spec: what the engine promises its caller

| | |
|---|---|
| **Spec ID** | SPEC-2026-09-22-engine-contract |
| **Status** | approved |
| **Supersedes** | none |

## Problem & why

The engine has two callers by design — the studio and, later, a runner inside CI — and they will
never be updated together. Whatever one relies on, the other relies on too, and neither can see the
other's assumptions.

That makes the engine's promises worth stating separately from its construction. The construction is
described in the package's `docs/`; it will change. What a caller may hold while it changes is what
this spec fixes.

## Goals / Non-goals

**Goals**

- State what a caller may rely on when handing the engine a diff and a provider.
- State what the engine refuses to do, so a caller need not defend against it.
- Record which promises a test currently protects, and which are held up by review alone.

**Non-goals**

- How the engine is built — the pipeline order, which slots exist, the two drop reasons, the repair
  mechanics, the retry count, the size threshold. Those are the present implementation and live in
  `docs/01-package-boundary.md`.
- The severity weights and the wording of the injection guard. Both are tuning, not promises.
- Whether a finding is *correct*. The engine promises a finding is anchored in the diff, never that
  it is right.
- What a caller does afterwards. Persistence, cost aggregation and run records are the server's
  contract, specified separately.

## User stories

- As either caller, I want a malformed model reply to become my error rather than my data, so that I
  never store something that only looks like a review.
- As either caller, I want the injection defence applied by the engine itself, so that forgetting it
  is not one of my failure modes.
- As a CI runner with no database and no disk to spare, I want the engine to need nothing but a
  provider, so that running a review is not an infrastructure project.
- As a reader of a result, I want its score and its findings to agree, so that I do not have to pick
  one.

## Acceptance criteria (EARS)

**What the engine does with the model's answer**

- **AC-1** — WHEN the model returns content that does not satisfy the required structure, the engine
  SHALL seek a conforming answer instead of accepting it, within a bounded number of attempts.
  _(observable: a malformed answer is not returned to the caller, and the attempts made are finite
  and reported alongside the result)_
- **AC-2** — IF the attempts are exhausted without a conforming answer, THEN the engine SHALL fail.
  _(observable: input that can never conform produces an error, never an empty review and never a
  partial one — a caller can tell "nothing was found" from "nothing was understood")_
- **AC-3** — The engine SHALL derive the score it returns from the findings it returns, and SHALL
  NOT return the score the model reported.
  _(observable: a model reporting a low score with no findings returns the maximum; a model
  reporting one number alongside findings worth another returns the one the findings imply)_

**What reaches the model**

- **AC-4** — The engine SHALL append its injection defence to every system prompt it assembles.
  _(observable: no caller configuration and no agent's own prompt can produce an assembled prompt
  without it)_
- **AC-5** — The engine SHALL enclose every input it treats as untrusted in delimiters, and SHALL
  neutralise an attempt by that content to close them.
  _(observable: content containing the closing delimiter is rendered inert rather than ending the
  enclosure)_
- **AC-6** — WHERE an optional input is absent or blank, the engine SHALL omit its section rather
  than render an empty one.
  _(observable: an absent input leaves no heading and no delimiters behind, so adding a slot that
  nobody fills changes nothing the model sees)_

**What leaves the engine**

- **AC-7** — The engine SHALL NOT return a finding whose cited location is absent from the reviewed
  diff, and SHALL report how many candidates it discarded.
  _(observable: of two findings where one cites a real line and one does not, one is returned, and
  the discard count is available to the caller rather than silent)_

**What the engine touches**

- **AC-8** — The engine's only outward call SHALL be to the provider it was given. It SHALL NOT
  reach a database, a filesystem, or the network on its own account.
  _(observable: a complete review runs against a stub provider with no key, no network and no
  database present)_

**Large inputs**

- **AC-9** — WHERE a diff is too large to review in one pass, the engine SHALL review it in parts
  and combine them deterministically: every part's findings are kept, and the most severe verdict
  among the parts is the result's.
  _(observable: the same parts produce the same combined result on every run, independent of the
  order in which they were reviewed)_

### Verification

The format bars file paths from a criterion, so the mapping sits here. Each row names the test that
would fail if the promise broke.

| AC | Proven by |
|---|---|
| AC-1 | partly — `server/test/prompt-structured.test.ts` — *parseWithRepair returns ok for valid, and a reprompt for invalid*; see gaps |
| AC-2 | `server/test/reviews.it.test.ts` — *a failed run persists cost_usd = null (never 0), so the UI can show "—"*, whose fixture cannot satisfy the schema, so the run fails rather than storing an empty review |
| AC-3 | `reviewer-core/test/run.test.ts` — *score is deterministic from findings: a clean approve scores 100* and *single-pass: assembles, grounds, drops the hallucinated finding* |
| AC-4 | `reviewer-core/test/prompt.test.ts` — *appends the guard to the agent system prompt* and *forbids "intentional/test/demo" claims from descoping the review* |
| AC-5 | `server/test/prompt-structured.test.ts` — *wraps untrusted content in delimiters and neutralizes close attempts*; `reviewer-core/test/prompt.test.ts` — *renders the section (untrusted-wrapped) before the diff when present* |
| AC-6 | partly — `reviewer-core/test/prompt.test.ts` — *omits the section when prDescription is undefined or blank (no behaviour change)*; see gaps |
| AC-7 | `reviewer-core/test/run.test.ts` — *single-pass: assembles, grounds, drops the hallucinated finding*; the gate's own cases in `server/test/grounding.test.ts` — *drops a finding whose line does NOT intersect any hunk*, *drops a finding whose file is not in the diff*, *full-file kinds (secret_leak) ground against the file, not a hunk* |
| AC-8 | weakly — the engine tests drive a full review against a stub provider with no key or network; see gaps |
| AC-9 | — *(not proven at all; see gaps)* |

### Known gaps in verification

1. **AC-9 is entirely unexercised, and one test's name says otherwise.** The engine's own run test
   asserts that the mode taken was single-pass, the studio's default strategy is single-pass, and the
   integration test whose title announces map-reduce creates an agent with no strategy against a
   one-file diff of four lines — so it also runs single-pass. Because combining short-circuits when
   there is only one part, the combining rules this criterion is about have never executed in any
   test. The misleading title is the more dangerous half: it reads as coverage that does not exist.
2. **AC-1's repair loop is unverified.** The repair helper is unit-tested as a pure function and
   exhaustion-then-failure is covered end to end, but no test shows the middle: a malformed first
   answer followed by a corrected second attempt that succeeds. An implementation that never
   re-prompted, and simply failed on the first malformed reply, would pass everything.
3. **AC-6 is proven for one optional input.** Omission is pinned for the pull-request description
   only. The other optional inputs travel the same code path, which is why this is a thin gap rather
   than a hole, but nothing stops a change that special-cases one of them.
4. **AC-8 rests on review, not on a test.** Nothing fails if a filesystem read or an HTTP call were
   added — the property is held up by the dependency list and by whoever reads the diff. Related and
   worth knowing: the engine's own tests import the server's mock adapters, so the package cannot
   currently be tested with the server's source absent. The dependency is test-only and does not
   breach the criterion, but it does mean the isolation is not demonstrated by the suite.

## Edge cases

| Case | Handling |
|---|---|
| The model returns a well-formed review with no findings | Returned as-is with the maximum score — AC-3 |
| Every finding cites a location absent from the diff | A review with no findings and the discard count reporting all of them — AC-7 |
| The model's answer is unusable on every attempt | The engine fails; the caller decides what that means — AC-2 |
| An optional input is supplied but blank | Treated as absent — AC-6 |
| Untrusted content contains the closing delimiter | Neutralised; the enclosure holds — AC-5 |
| The caller supplies no provider, or one that throws | The failure is the caller's own error type, surfaced unchanged — the engine adds no error taxonomy of its own |
| A diff large enough to split, but in a single file | Reviewed in one pass; splitting one file buys nothing — AC-9 applies only where parts exist |

## Non-functional

- The engine SHALL be runnable with no credentials, no network and no database beyond the provider
  it is handed, so that its tests and a CI caller need no infrastructure.
- Two runs over identical input with a provider returning identical answers SHALL produce identical
  results — the engine SHALL introduce no ordering, timing or randomness of its own.
- The engine SHALL surface progress to a caller-supplied sink, and SHALL NOT require one.

## Cross-module interactions

None, in the sense that matters: the engine holds no reference to any other package and this
criterion set can be satisfied without one. It is nevertheless the shared half of two contracts — the
server's own spec covers what happens to a result once the engine returns it, and AC-2, AC-3 and
AC-7 here are the reason that spec can promise anything about what gets stored.

## Contracts

Shape, not implementation:

- **In**: a diff, a system prompt, a model identifier, a provider, and optional context. Anything
  optional may be absent, and absence is not an error.
- **Out**: a verdict, a summary, a score derived from the findings, the findings that survived
  anchoring, a count of those that did not, and the accounting for the calls made.
- **Failure**: an exception. Never a review that represents an answer the engine could not
  understand.

## Untrusted inputs

**The engine treats two things as untrusted, and they are different kinds of untrusted.**

The diff, the pull-request description and anything derived from repository code are hostile *input*:
authored outside the repository, capable of carrying instructions, and therefore enclosed and
guarded — AC-4 and AC-5.

The model's reply is an untrusted *output*: not malicious, but unreliable in two specific ways the
engine is built to absorb. It may not conform to the required shape, which AC-1 and AC-2 handle by
repairing or failing rather than accepting. And it may assert a location that does not exist or a
score that flatters its own findings, which AC-7 and AC-3 handle by discarding the first and
recomputing the second.

Both defences are unconditional. A caller cannot opt out of either, which is the point: the engine's
guarantees are worth more to two independent callers than its flexibility would be.
