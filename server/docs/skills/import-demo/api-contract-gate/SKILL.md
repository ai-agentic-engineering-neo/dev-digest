---
name: api-contract-gate
description: Flag any changed HTTP route handler whose request or response shape changed without a corresponding contract/schema update.
type: convention
---

# API Contract Gate

Many backends keep the wire shape of a request/response separate from the
handler code that produces it — a schema file, a shared types package, an
OpenAPI/JSON-Schema definition, a Zod/Yup/Joi validator, or a hand-written
DTO interface that both the server and its callers import. When that
separation exists, it only protects callers if every change to a handler's
actual request or response shape is matched by a change to that same
schema/contract definition. A handler that silently drifts from its own
contract is a correctness bug even though nothing throws: the type system
and any generated client are now lying about what the endpoint really does.

## What to look for

- A route handler's return statement gains, drops, renames, or changes the
  type of a field, but the corresponding schema/contract/DTO definition in
  the diff is unchanged.
- A request body or query-param handler starts reading a new field, or stops
  validating one it used to require, without the request schema changing to
  match.
- A shared contract type is changed, but only one of several handlers that
  return that shape is updated — the others still claim the old contract
  while returning something new (or vice versa).
- A response's error/success envelope changes shape (e.g. a field moves from
  the top level into a nested object, or a boolean becomes an object) without
  every consumer of that contract being touched in the same diff.

## Why this matters even when nothing "breaks" locally

A handler and its contract can be edited independently and each still
compile or run fine in isolation — the mismatch only surfaces at the
boundary, in a client that was generated from (or trusted) the old contract,
or in a test that mocks the contract instead of hitting the real handler.
That is exactly the kind of drift a single-PR, single-file review is well
positioned to catch and a type checker alone is not, because nothing forces
the schema and the handler to be edited together.

## What to report

Cite the exact handler (file:line) whose returned or accepted shape changed,
and the contract/schema file that should have changed alongside it but did
not (or note explicitly if no such file exists in the diff at all). Describe
the concrete shape difference — the field added, removed, renamed, or
retyped — and, if visible, name one caller or test that would now receive
something other than what its declared type promises. Do not flag a handler
whose contract update is present elsewhere in the same diff; the point is to
catch a change on only one side of the boundary, not to require every
handler to touch its contract file.
