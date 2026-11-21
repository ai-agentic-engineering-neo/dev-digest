# M<n> — <feature name> (server)

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

- Module: `src/modules/<name>/` (new) or the existing module changed
- Routes: method, path, request and response contracts
- Tables: which ones in `src/db/schema/` (check before adding a new one)
- Contracts: `@devdigest/shared` additions or changes (mirror to the client copy)
- Adapters or env vars added
- Prompt slot fed to `reviewer-core`, if any

## Acceptance criteria

- [ ] Observable, testable statements.

## Tests

Which criterion is covered by which test: unit (`*.test.ts`) and integration (`*.it.test.ts`).
See [`TESTING.md`](../../TESTING.md).

## Related specs

- Specs for the same feature in other packages, if any.

## Open questions

- Anything undecided.
