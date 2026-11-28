# Experiment: API Contract Reviewer without skills vs with skills

- **PR:** [DanZhul/dev-digest#7](https://github.com/DanZhul/dev-digest/pull/7), branch
  `experiment/api-contract-break`. Two server-only contract breaks: the
  `DELETE /repos/:id` response field `deleted` becomes `removedId`, and
  `POST /repos/:id/poll` becomes `POST /repos/:id/sync` with no alias. The client
  still reads `deleted` and calls `/poll`.
- **Agent:** API Contract Reviewer, `openrouter / anthropic/claude-haiku-5.5`,
  system prompt [agent-prompt.md](agent-prompt.md), repo intel on.
- **Skills (second run):** `breaking-change` (imported), `response-schema`,
  `semver-discipline`, `deprecation-policy`, in that order, all enabled.
- Same PR, same model, run one after the other on 2026-11-28.

## Results

| | Without skills | With skills |
|---|---|---|
| Verdict | request changes | request changes |
| Findings (CRITICAL) | 2 (2) | 2 (2) |
| `deleted` → `removedId` found | yes, `repos/routes.ts:20` | yes, `repos/routes.ts:20` |
| `/poll` → `/sync` found | yes, `polling/routes.ts:24` | yes, `polling/routes.ts:24` |
| Score | 30 | 30 |
| Tokens in → out | 7 701 → 1 565 | 9 464 → 1 959 |
| Skills block in the trace | — | 4 skills, 1 196 tokens |
| Cost | $0.00155 | $0.00193 |

## What changed with skills

- **Detection stayed the same.** Both runs found both breaks with the right
  severity and cited the changed lines. The agent prompt already lists these
  classes (removed/renamed routes and fields), so for a two-line,
  textbook break the base prompt is enough.
- **The fixes followed the team's policy.** With skills, both suggestions use
  the exact mechanics from `deprecation-policy` and `breaking-change`: keep the
  old path or field as a working alias, mark it (`@deprecated`,
  `deprecated: true` in the schema, a `Deprecation` header), and remove it only
  in a later major version. Without skills the fixes were in the same direction
  but less specific.
- **Semver came up.** The summary with skills says the PR ships "with no
  alias, deprecation, or version bump", which is the `semver-discipline` check.
  The run without skills does not mention versioning.
- **Price:** +23% input tokens (the skills block is 1 196 tokens) and +24% cost
  per run.

## Takeaway

On an obvious break, skills do not change *whether* the agent finds it. They
change *how* it asks for the fix: the agent applies the team's rules
(alias → deprecate → remove in a major version) instead of a generic one. The
gain should be larger on subtler changes the base prompt does not name, such as
required → optional fields (`response-schema`) or a minor bump hiding a
breaking change (`semver-discipline`). That is the next experiment.
