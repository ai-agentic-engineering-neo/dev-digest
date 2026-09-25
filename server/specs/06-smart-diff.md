# 06 — Smart Diff (server)

UI half: [`client/specs/06-smart-diff.md`](../../client/specs/06-smart-diff.md).
Course slot: **L03 — Smart Diff** (the other half of L03, Intent layer, is
`server/specs/05-intent-layer.md`).
Status: **in progress** (2026-09-24).

## Goal

Group a PR's files by role (core, tests, wiring, docs, boilerplate) and attach
the finding lines of each agent's newest review, so the client can render the diff sorted by
what matters first — no model call.

## Out of scope

- Criteria 7, 15 (PR description + demo video — done by a human, not this module).
- Agent runs tab, `pseudocode_summary`, a real `split_suggestion` (large-PR
  banner), and the L08 pre-filter use of `classifyFile`.

## Acceptance criteria

1. `classifyFile` and its patterns/role order live in one constants file
   (`modules/smart-diff/domain/constants.ts`); a unit test covers the
   path → role table, including the three contested cases from the brief
   (`__snapshots__` inside `__tests__`, a `.claude/skills/**/*.md` file, and
   `e2e/README.md`). **[B8]**
2. `GET /pulls/:id/smart-diff` returns a response that validates against the
   `SmartDiff` contract; `SmartDiffRole` is extended to 5 values
   (`core | tests | wiring | docs | boilerplate`) in both `vendor/shared`
   copies, byte-identical. **[B9]**
3. Grouping works before any review has run (every file's `finding_lines` is
   `[]`), and after a review, the findings of **each agent's newest** review
   (by `desc(createdAt)`) feed `finding_lines` — an agent's older review's
   lines never appear, another agent's current review's lines do
   (changed 2026-09-25: was the single newest review). The route makes 0 LLM calls in either case. **[B2] [B10]**
4. A PR from another workspace, or an unknown PR id, is a 404 — the same
   workspace-scoped lookup every other `/pulls/:id/*` route uses.
