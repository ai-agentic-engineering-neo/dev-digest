# M<n> — <feature name> (e2e)

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

- Flow file: `NN-name.flow.json` added or changed
- Journey: the steps and what each one asserts (`--text`, `--url`)
- Seed data: anything the flow needs from `server/src/db/seed.ts`
- Client text or routes the flow depends on

## Acceptance criteria

- [ ] Observable, testable statements.

## Tests

Which criterion is covered by which test: the flow itself, run with `../scripts/e2e.sh`.
See [`TESTING.md`](../../TESTING.md).

## Related specs

- Specs for the same feature in other packages, if any.

## Open questions

- Anything undecided.
