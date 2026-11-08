# Spec: PR Brief extras (P3 follow-up)   |   Spec ID: SPEC-07   |   Status: draft
Modules: client · server (server only if AC-1 needs a read the client doesn't have yet — to be checked)
Related: [pr-brief.md](pr-brief.md) (SPEC-06, the PR Brief this extends).

> **Stub.** Holds the three P3 criteria moved out of SPEC-06 on 2026-11-08 so SPEC-06 stays P1 + P2. Not ready
> for planning: run `spec-creator` on it (research, edge cases, design review) after SPEC-06 is implemented.

## Problem and why

SPEC-06 gives a reviewer the why, risks and where to start. It does not show how the PR fared in review, and
risks and focus items are one-liners. These extras add the review outcome to the brief banner and more detail
on demand.

## Acceptance criteria (EARS) — carried over from SPEC-06 P3

- **AC-1** [P3] WHERE the PR has at least one finished review run, the brief's summary banner SHALL also show
  the latest review's verdict, its finding and blocker counts, and the PR score, as on the Agent runs tab.
  "Latest review" = the most recent finished run (decided 2026-11-08). With no review, the banner shows the
  summary only. 0 LLM calls (reads stored runs).
- **AC-2** [P3] WHEN the user expands a risk item, the system SHALL show its explanation and all its file refs.
- **AC-3** [P3] WHEN a Review focus item has a line (SPEC-06 AC-7), the click (SPEC-06 AC-9) SHALL scroll to
  that line in the flat Files changed list and highlight it.

- **AC-4** [P3] WHEN SPEC-05 (skill ↔ doc attachments) is implemented, the PR Brief spec-docs input
  (SPEC-06 AC-4) SHALL also include docs inherited from enabled linked skills, in each agent's SPEC-05 merged
  order, de-duplicated by path, within the same 4,000-token cap. (Moved from SPEC-06 on 2026-11-08: SPEC-05 is
  not implemented.)

## Inputs (provenance)

- Verdict, counts, score: `[reused: stored review runs]`, 0 LLM calls.
- Risk explanation, focus lines: `[reused: SPEC-06 stored brief]`.

## [NEEDS CLARIFICATION]

- To be filled by `spec-creator` (edge cases, design review, whether AC-1 needs a server read).
