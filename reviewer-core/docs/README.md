# docs — reviewer-core

Deep-dives for the review engine (design rationale, decisions).

## The grounding gate, in more depth than the pipeline diagram

`README.md`'s pipeline diagram shows `groundFindings()` as one box between
the model's structured output and the final `Review`. What it actually does:
every finding the model returns must cite a `file`/`start_line`/`end_line`
that exists in the diff it was given — if the citation doesn't resolve to a
real, changed line, the finding is dropped, no exceptions, no "close enough"
matching. This is mechanical (string/line-number matching against the diff),
not a second LLM judgment call — the whole point is that grounding can't be
fooled by a plausible-sounding but hallucinated finding, because it never
asks the model anything; it checks the model's claim against ground truth.

The score is then **recomputed** from whatever findings survived grounding —
`reviewer-core/CLAUDE.md`'s do-not-touch section is explicit that the
model's own self-reported score must never be trusted. This matters for
every downstream consumer (`server`'s `PrMeta.score`, the findings-by-severity
counts, the cost/score consistency assumptions in `server/docs/README.md`):
whatever `reviewer-core` returns is already the ground-truth-filtered,
deterministically-scored result. Nothing downstream should second-guess it.

## Why this package has no build step

`reviewer-core` is consumed as raw TypeScript source via a tsconfig path
alias (`@devdigest/reviewer-core` → `../reviewer-core/src`), both by
`server` in dev (`tsx`) and by its own tests (`vitest`). `npm run build`
literally runs `tsc --noEmit` — a type-check, not a compile — because there
is no scenario in this checkout where a compiled `dist/` is actually loaded
by anything. If a future lesson (e.g. the CI runner in L06) needs a real
published artifact, that's a new build pipeline to add, not a flag to flip
on this one.
