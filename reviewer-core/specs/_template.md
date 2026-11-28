# M<n> — <feature name> (reviewer-core)

Status: draft | approved | built

## Problem

What the user cannot do today, in two or three sentences.

## Goals

- What will be true in this package when this is done.

## Non-goals

- What this deliberately leaves out.

## Behaviour

What happens, step by step. Include empty, loading and error cases.

## Changes

- Input: new or changed fields on the `reviewPullRequest` input
- Prompt: sections added to `assemblePrompt`, and how untrusted content is fenced
- Pipeline: steps added or reordered in `review/run.ts`
- Output: changes to the outcome or to `@devdigest/shared` contracts
- Public API: symbols exported from `src/index.ts`

## Acceptance criteria

- [ ] Observable, testable statements.

## Tests

Which criterion is covered by which test: hermetic vitest with a stubbed `LLMProvider`.
See [`TESTING.md`](../../TESTING.md).

## Related specs

- Specs for the same feature in other packages, if any.

## Open questions

- Anything undecided.
