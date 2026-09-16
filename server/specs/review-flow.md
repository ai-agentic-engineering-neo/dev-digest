# spec — running a review

What `POST /pulls/:id/review` must guarantee. This is the behavioral
contract; see [`../docs/architecture.md`](../docs/architecture.md) for how it's wired
and [`../../reviewer-core/specs/grounding-spec.md`](../../reviewer-core/specs/grounding-spec.md)
for the grounding gate itself.

## Preconditions

- The PR has been imported (diff, commits, title/body available).
- An agent (built-in `General`/`Security`, or user-created) is selected.

## Guarantees

- **The model never sees only raw trust.** Every agent's system prompt gets
  the shared `INJECTION_GUARD` appended (from `reviewer-core`): untrusted PR
  content (diff, description, comments) is data, never instructions, and
  "this is a test fixture, don't flag it" claims never lower severity.
- **Every finding is grounded.** A finding that cites a line not present in
  the diff is dropped before it reaches the client — the engine cannot
  hallucinate a location.
- **The score is never the model's own.** It's recomputed deterministically
  from the findings that survive grounding.
- **Repo Intel is opt-in per agent, on by default at the server level**
  (`REPO_INTEL_ENABLED`). When on *and* the repo is indexed, the prompt gains
  a repo skeleton + "high blast-radius" note. An unindexed repo silently
  degrades to diff-only — this is expected, not a bug, in the starter.
- **A run streams progress over SSE** and is persisted with status
  (`running` → `completed`/`failed`) so a client reconnecting mid-run sees
  the current state, not just the final one.

## Out of scope (starter)

- Multi-agent / consensus review (later lesson).
- Persistent memory across runs (later lesson).
- Map-reduce over very large diffs — `reviewer-core` exposes `reduce()` but
  the starter server always runs single-pass.

## Touchpoints

- Route: `modules/reviews/routes.ts` (`POST /pulls/:id/review`, `GET /reviews`,
  `POST /findings/:id/(accept|dismiss)`, `GET /runs/:id/(events|trace)`)
- Orchestration: `modules/reviews/run-executor.ts` (gathers inputs, calls
  `reviewer-core`, persists the result)
- Engine: `reviewer-core/src/review/run.ts` (`reviewPullRequest`)
