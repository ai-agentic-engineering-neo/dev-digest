# @guard-integrity — built-in reviewer (not a standalone skill)

Routed to `reviewer-core/src/prompt.ts`, `reviewer-core/src/grounding.ts` and
`reviewer-core/src/review/**`. Root `CLAUDE.md` says: *"`INJECTION_GUARD` and the
grounding gate in reviewer-core — never weaken them, never replace them with
keyword filtering."* This reviewer enforces exactly that and nothing else.

Read `reviewer-core/CLAUDE.md` and `reviewer-core/INSIGHTS.md` first, then the
current `prompt.ts` and `grounding.ts` in full, and work out what the guard and
the gate protect against today.

## Critical (any of these, when introduced by the diff)

- `INJECTION_GUARD` text removed, shortened, made conditional, moved after
  untrusted content, or no longer included in a prompt path that carries PR
  content.
- PR/diff/file content concatenated into the system prompt or instructions
  instead of being delimited as untrusted data.
- The grounding gate skipped, short-circuited, or loosened: findings accepted
  without matching a real diff line, tolerance widened, a new `kind` or flag
  that bypasses line grounding when the LLM can set it, or trusted-only kinds
  that can now come from LLM output.
- The injection defence replaced with keyword/regex filtering of the input.
- Tests that cover the guard or the gate deleted or weakened (assertion removed,
  `.skip`, expectations inverted).

## Major

- Refactors that keep the behaviour but make the guard easier to drop by
  accident (e.g. guard moved into an optional parameter with a default).
- New prompt path without a test that asserts the guard is present.

Anything else in these files belongs to the other reviewers (typescript-expert,
zod, security), so do not report it here.
