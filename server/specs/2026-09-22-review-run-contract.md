# Spec: what a review run promises its caller

| | |
|---|---|
| **Spec ID** | SPEC-2026-09-22-review-run-contract |
| **Status** | approved |
| **Supersedes** | none |

## Problem & why

The review run is the engine's only product, and it has been reimplemented more than once — the
gate moved into a shared package, the cost figure changed meaning, the trigger stopped blocking.
Each of those was a legitimate change to *how* a run works, and each risked quietly changing *what*
a run promises.

This spec is the invariant half. It states what a caller may rely on across any future rewrite, so
that a refactor which breaks one of these is recognised as a behaviour change rather than shipped as
a tidy-up.

## Goals / Non-goals

**Goals**

- Fix the promises a caller can hold: what comes back from a trigger, what is stored afterwards,
  and what the list reports about cost.
- Make each promise checkable without reading the implementation.
- Record which promises are currently proven by a test and which are not.

**Non-goals**

- How the run is structured — the stages, the prompt slots, the gate's two drop reasons, the score's
  arithmetic. That is a description of the present implementation and lives in the package's `docs/`.
- The severity weights. Changing them changes behaviour, but they are a tuning decision, not a
  promise to a caller.
- Anything the reviewer decides. The *quality* of a finding is a prompt and model concern; this spec
  covers only what the system does with whatever comes back.
- The pull-request list's findings column, which has its own spec.

## User stories

- As a caller triggering a review, I want an identifier and control back immediately, so that a slow
  model does not hold my request open.
- As a reader of a stored review, I want its score and its findings to be two views of one fact, so
  that I never have to decide which of them to believe.
- As someone auditing spend, I want the figure against a pull request to answer "what has this
  cost", so that I can add up a repository without re-deriving anything.
- As someone debugging a run that produced nothing, I want the run to still be there with the reason,
  so that failure is diagnosable after a reload.

## Acceptance criteria (EARS)

**The trigger**

- **AC-1** — WHEN a review is requested for a pull request, the system SHALL respond with an
  identifier for every run it started, before any of those runs has consulted a model.
  _(observable: the response carries one identifier per targeted agent and carries no findings;
  its latency does not grow with the model's)_
- **AC-2** — WHILE a run is in progress the system SHALL expose its progress as a stream addressed
  by that run's identifier, and a reader who subscribes after events have already occurred SHALL
  still receive them.
  _(observable: subscribing once the run is already under way yields the earlier events, not only
  the ones that follow)_

**What is stored**

- **AC-3** — The system SHALL store only findings whose cited location exists in the reviewed diff,
  and SHALL NOT store one that cites a location absent from it.
  _(observable: a reply containing one citable and one non-citable finding yields a stored review
  holding exactly the citable one)_
- **AC-4** — The stored score SHALL be derived from the findings the system stored, and the score
  the model reported SHALL NOT be stored.
  _(observable: a reply whose own score differs from the derived one stores the derived one; two
  runs that store identical findings store identical scores)_
- **AC-5** — IF a run ends without producing a review, THEN the system SHALL retain a record of that
  run carrying a terminal state and the reason it ended.
  _(observable: a run whose model output cannot be used is afterwards readable as failed, with its
  reason, and is distinguishable from one a user cancelled)_

**What the list reports**

- **AC-6** — The cost reported against a pull request SHALL be the total of every completed run on
  it, not the cost of any one run.
  _(observable: two completed runs report their sum; the figure does not change when a later run
  costs less than an earlier one)_
- **AC-7** — IF a completed run carries no cost from its provider, THEN it SHALL contribute nothing
  to that total rather than lowering it; and IF no run on a pull request carries a cost, THEN the
  system SHALL report no cost rather than zero.
  _(observable: one priced and one unpriced run report the priced amount; an all-unpriced pull
  request is distinguishable from a free one)_

### Verification

The spec's own rule forbids file paths in a criterion, so the mapping lives here rather than inside
the statements. Each row names the test that would fail if the promise broke.

| AC | Proven by |
|---|---|
| AC-1 | — *(not proven; see gaps)* |
| AC-2 | `server/test/reviews.it.test.ts` — *SSE: /runs/:id/events streams events and completes* |
| AC-3 | `server/test/reviews.it.test.ts` — *runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one*; the gate itself in `server/test/grounding.test.ts` — *drops a finding whose line does NOT intersect any hunk* and *drops a finding whose file is not in the diff* |
| AC-4 | `server/test/reviews.it.test.ts` — same test, which asserts the stored score against the derived value and not the model's reported one |
| AC-5 | partly — `server/test/reviews.it.test.ts` — *a failed run persists cost_usd = null (never 0), so the UI can show "—"* proves the terminal state; see gaps for the rest |
| AC-6 | `server/test/pulls-cost.it.test.ts` — *sums every completed run on the PR, and reports null for a PR nobody has run* |
| AC-7 | `server/test/pulls-cost.it.test.ts` — *a run the provider never priced adds nothing rather than zeroing the total* and *a PR whose only runs are unpriced reports null, never 0 — "—" and "free" differ* |

### Known gaps in verification

Named rather than filled, because a spec that claims coverage it does not have is worse than one
that admits the hole.

1. **AC-1 is unproven.** Every existing test is written so that it passes whether the trigger
   returns early or blocks until the run finishes: they read the identifiers out of the response and
   then wait for the run to reach a terminal state, which a blocking endpoint would also satisfy.
   Two comments in the suite describe the behaviour, and no assertion depends on it. Making the
   endpoint synchronous again would turn the product unusable and the suite green.
2. **AC-5's "reason" half is unproven.** The terminal state is asserted; the persisted reason is
   never read back by a test, so an implementation that recorded a failure with an empty reason
   would pass.
3. **Cancellation is unexercised end to end.** A cancelled run is meant to be distinguishable from a
   failed one, and no test drives a cancellation; only a helper knows the status exists.

## Edge cases

| Case | Handling |
|---|---|
| The model reports findings but every one of them cites a location absent from the diff | A review is stored with no findings, and its score reflects that — AC-3, AC-4 |
| The model reports no findings at all | Stored as a review with none; not a failure |
| The model's reply cannot be used at all, however many attempts are made | No review is stored; the run remains as a failed record with its reason — AC-5 |
| A user cancels a run mid-flight | Terminal record, distinguishable from a failure — AC-5 |
| Several agents are targeted in one request | One identifier per agent, each with its own record and its own outcome; one failing does not withhold the others |
| A pull request has never been reviewed | No cost is reported, and the absence is distinguishable from a cost of zero — AC-7 |
| A repeated run on the same pull request | Adds to the cost total, which is about the pull request, and replaces nothing — AC-6 |

## Non-functional

- The trigger's response time SHALL be independent of the model's; a slower model SHALL make a run
  slower without making the request slower.
- A run SHALL always reach a terminal state. A process that ends mid-run SHALL NOT leave a record
  that is permanently in progress.
- A failure in one run of a multi-agent request SHALL NOT prevent the others from completing or from
  being recorded.

## Cross-module interactions

None. Every promise here is made and kept by the API; the client and the engine are on either side of
it but neither is party to it, which is why this spec sits in the server's own `specs/` rather than
at the repository root. The client relies on AC-1 and AC-2 in order to show a run before it has
finished, and on AC-5 to show a failure after a reload — but it could be replaced wholesale without
touching any criterion above.

## Contracts

Shape, not implementation:

- **The trigger's answer** carries one identifier per started run. It does not carry the review;
  a caller that waits for findings in it waits forever.
- **A run record** carries a terminal state, and when the run did not succeed, the reason. It exists
  from the moment the run is started, not from the moment it finishes.
- **A stored review** carries a verdict, a summary, a score and its findings, and the score is a
  function of those findings.
- **A cost** is absent when unknown. Absent and zero mean different things and are never conflated.

## Untrusted inputs

**The model's reply is an untrusted input to this contract**, which is what AC-3 and AC-4 exist to
contain. The reply proposes both the findings and a score, and the system takes neither at face
value: a finding must cite a location that really exists in the diff to be stored at all, and the
score is recomputed rather than copied.

The practical consequence is that the reply cannot make the system assert something the diff does
not support. It can still be wrong about code that genuinely changed — that is a review-quality
problem, not a contract one — but it cannot invent a location, and it cannot report a flattering
number alongside findings that contradict it.
