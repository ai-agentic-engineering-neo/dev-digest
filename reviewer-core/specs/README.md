# specs — reviewer-core

Specs / acceptance criteria for the `reviewer-core` package.

## Prompt slots reserved for later course lessons

`assemblePrompt()` (`src/prompt.ts`) already accepts optional `skills`,
`memory`, `specs`, and `callers` fields on its input. In this starter, the
`server` only ever passes the diff, system prompt, and repo map — these four
slots are simply omitted, not stubbed with placeholder values. The contract
for whichever lesson wires one up:

- `skills` — linked skill bodies, joined and rendered under a `## Skills /
  rules` heading. Community skills are only "trusted-ish" — sanitization is
  the caller's responsibility before this point, not `reviewer-core`'s.
- `memory` — curated memory items, rendered as a bullet list under
  `## Relevant memory`. Treated as trusted (unlike `specs`/diff content).
- `specs` — project-context documents, delimiter-wrapped via
  `wrapUntrusted()` like the diff, because spec files can contain
  attacker-controlled text (a PR can modify its own repo's specs). Never
  render `specs` content without going through `wrapUntrusted()`.
- `callers` — a single pre-rendered blast-radius block, rendered before the
  repo skeleton when present.

None of these may bypass the `INJECTION_GUARD` appended to every prompt
(`assemblePrompt`) — see the do-not-touch note in `CLAUDE.md`.

## `groundFindings()` — the contract nothing downstream may relax

Every finding in the returned `Review` has already been checked against the
diff it was grounded from: `file`/`start_line`/`end_line` resolve to an
actually-changed line, or the finding was dropped before this package ever
returns it. `score` is deterministically recomputed from the surviving
findings. Any consumer (today: `server`'s persistence + `PrMeta` fields) may
rely on both of these being already true — re-validating them downstream
would be redundant, and *weakening* them (e.g. trusting a model's
self-reported score somewhere else) would reopen exactly the hallucination
risk grounding exists to close.

## `reduce()` / map-reduce path

`reduceReviews()` + `sliceDiff()` (exported from `src/index.ts`) support
running the reviewer over a diff too large for one pass, then merging the
per-chunk `Review`s into one. Used by the existing map-reduce integration
test (`server/test/reviews.it.test.ts`'s "map-reduce + grounding" case) —
grounding and score recomputation both still apply to the merged result, not
just each chunk in isolation.
