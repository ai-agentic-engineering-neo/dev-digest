# M<n> — <feature name> (client)

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

- Routes: pages added or changed under `src/app/`
- Components: `_components/<Name>/` folders, and any `@devdigest/ui` additions
- Hooks: additions to `src/lib/hooks/` and the endpoints they call
- Strings: message keys under `messages/en/`
- Contracts: which `@devdigest/shared` types are used (must match the server copy)

## Acceptance criteria

- [ ] Observable, testable statements.

## Tests

Which criterion is covered by which test: component tests (`*.test.tsx`), and whether an e2e flow changes.
See [`TESTING.md`](../../TESTING.md).

## Related specs

- Specs for the same feature in other packages, if any.

## Open questions

- Anything undecided.
