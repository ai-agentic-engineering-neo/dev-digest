# What a recommendation has to look like

The bar, same shape as
[`../engineering-insights/examples.md`](../engineering-insights/examples.md):
**a `Target` file path plus a concrete edit, backed by a signal from Step 3.**
No `Target`, not a recommendation — generic advice is rejected by
construction.

## Not a recommendation

❌ "Improve agent handoffs."

Not specific to any file, not backed by a cited signal, and not something a
future run could act on directly.

## A recommendation

✅ `Target: .claude/skills/implement-plan/SKILL.md` — add a line under
"Relaying blocking stops" reminding the orchestrator that a fix-loop
re-dispatch after `plan-verifier` `INCOMPLETE` should use `SendMessage`,
because run `2026-08-12` spent 18k tokens re-deriving context a fresh
`implementer` had already gathered.

Why it works: names the exact file and section to edit, states the change,
and cites the handoff-efficiency signal (Step 3.1) with the concrete cost
that justifies it — the two call sites (the original `implementer` dispatch,
and the fresh one that re-derived the same context) are the evidence, not an
assertion.

## A worked ledger excerpt — timeline table

The timeline (Step 1) is a plain table, one row per dispatch, in the order
the dispatches happened:

| # | Agent | Dispatch | Purpose | Tokens | Tool uses | Duration | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | implementer | `Agent` (fresh) | Implement `plans/01-workflow-retro.md` | 42,100 | 18 | 6m12s | Finished artifact |
| 2 | plan-verifier | `Agent` (fresh) | Verify implementer's diff against the plan | 9,400 | 6 | 1m50s | `PASS` |
| 3 | implementer | `Agent` (fresh — **flagged**, see signal 3.1) | Fix an architecture-reviewer finding | 18,000 | 9 | 2m40s | Finished artifact |

Row 3 is the kind of entry Step 3's handoff-efficiency signal flags: the
same agent type ran again via a fresh `Agent` dispatch rather than a
`SendMessage` continuation of dispatch #1's instance, which would have kept
that instance's already-gathered context.
