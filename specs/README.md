# Specs — cross-package

Specs for features that touch more than one package (e.g. a new contract in
`@devdigest/shared` plus server routes plus UI). Single-package specs live in
`<package>/specs/`.

## Naming

`<lesson-or-area>-<feature>.md`, e.g. `L03-smart-diff.md`, `L04-blast-radius.md`.

## Template

```markdown
# <Feature>

Status: draft | agreed | implemented
Packages: client, server, reviewer-core, e2e

## Goal
What problem this solves and for whom.

## Scope
In / out of scope.

## Contracts
New or changed schemas in `@devdigest/shared` (remember: server + client copies).

## Behaviour
Per package: routes, UI, engine changes.

## Acceptance criteria
- [ ] …

## Open questions
```
