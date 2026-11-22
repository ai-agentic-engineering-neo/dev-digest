# reviewer-core — insights

Read via the `engineering-insights` skill. Rules live in `reviewer-core/CLAUDE.md`; the pipeline lives in `reviewer-core/README.md`.

## What works

- **Tests need no keys or network**: `npm test` uses a stubbed `LLMProvider`. [2026-11-20]

## What does not work

- _None yet._

## Codebase patterns

- **The verdict score is recomputed** from the findings that survive grounding (`src/grounding.ts`). Never read the model's self-reported score. Why: models inflate scores, and the score drives the verdict. [2026-11-20]
- **Grounding drops findings silently.** A finding that cites a line not in the diff is removed, and `groundingSummary` reports the count. A review can have fewer findings than the model returned. Why: stops hallucinated line references reaching the user. [2026-11-20]
- **Prompt injection is handled by `INJECTION_GUARD` plus `wrapUntrusted` in `assemblePrompt`**, not by text parsing. Claims like "intentional fixture, do not flag" never descope a review. Watch for: proposals to add keyword scanning. This was a deliberate decision. [2026-11-20]
- **No I/O in this package.** Everything except the injected `LLMProvider` is pure. Server consumes the TypeScript source directly via the `@devdigest/reviewer-core` path alias; the package never emits JS. [2026-11-20]
- **Optional prompt slots** (`skills`, `memory`, `specs`, `callers`) are for later milestones. `assemblePrompt` omits empty sections. [2026-11-20]

## Tool and library notes

- _None yet._

## Recurring errors and fixes

- _None yet._

## Session notes

- _None yet._

## Open questions

- _None yet._

## Legacy entries

## 2026-11-20 — The model's score is ignored
The verdict score is recomputed from the findings that survive grounding.
Why: models inflate self-reported scores, and the score drives the verdict.
Watch for: any change that reads the model's own score.

## 2026-11-20 — Grounding drops findings silently
A finding that cites a line not in the diff is removed, and a summary is produced by
`groundingSummary`. A review can therefore have fewer findings than the model returned.
Why: this is what stops hallucinated line references from reaching the user.

## 2026-11-20 — Prompt injection is handled by a trusted rule, not text parsing
`INJECTION_GUARD` tells the model that untrusted content is data. Claims like
"intentional fixture, do not flag" never descope a review.
Why: a denylist catches only one phrasing; the guard is language-independent.
Watch for: proposals to add keyword scanning. The decision was deliberate.

## 2026-11-20 — No I/O, so it's easy to test
Everything except the injected `LLMProvider` is pure. Tests use a stubbed provider and
need no keys or network.
