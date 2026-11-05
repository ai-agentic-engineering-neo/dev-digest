---
name: api-versioning-policy
description: >
  Use on every PR that changes an existing HTTP route or response shape.
  Flag breaking changes shipped without a new versioned route or a deprecation path.
type: rubric
allowed-tools: Bash(curl:*)
---
# API versioning policy

A breaking change to a published route must not replace the old behaviour in place.

- CRITICAL: a breaking change (see the reference list) is applied to an existing
  route instead of a new versioned route (`/v2/...`) or a new optional field.
- WARNING: a route is removed without a deprecation period (old route kept and
  marked deprecated for at least one release).
- SUGGESTION: a new response field is added without being documented in the
  contract / OpenAPI description.

Name the old and the new contract in the finding and the client call that breaks.
