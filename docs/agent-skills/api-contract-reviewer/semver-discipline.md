---
name: semver-discipline
description: Require a major version bump plus a changelog entry for breaking API changes, minor for additive ones, patch for fixes; flag breaking diffs that ship without one.
---

# Semantic Versioning Discipline

## Rule
The version of an API tells consumers what upgrading costs. Under semantic
versioning a breaking change requires a MAJOR bump, a backwards-compatible addition
requires a MINOR bump, and a backwards-compatible fix requires a PATCH bump. The
bump and a changelog entry must ship in the same pull request as the change.

## Directive
First classify the change set in the diff as breaking, additive, or fix-only, using
the request and response compatibility rules (removed or renamed routes and fields,
new required inputs, retyped fields are breaking; new routes and new optional
fields are additive). Then check where the project records its version, and flag
each mismatch:

1. **Breaking change, no major bump** - the diff removes, renames or retypes part of
   the API surface, but none of the changed files raise the MAJOR component in
   `package.json` `version`, OpenAPI `info.version`, the route prefix (`/v1` to
   `/v2`), or a `CHANGELOG.md` heading. State which version files the diff does not
   touch.
2. **Additive change shipped as a patch** - a new route or field released as
   `x.y.(z+1)`, or a fix released as a minor bump without a reason.
3. **Breaking change labelled as non-breaking** - the changelog or version claims
   `Fixed`, `Chore` or a patch/minor bump while the diff shows a breaking change.
4. **Version changed without a changelog entry**, or a changelog entry that
   describes a different change than the diff.
5. **Version lowered, or two version markers disagree** - `package.json` says `2.0.0`
   while `openapi.yaml` still says `1.3.0`.
6. **Pre-1.0 versions** (`0.y.z`) - a breaking change must raise MINOR, an additive
   change or fix raises PATCH.

If a diff contains no API-surface change at all, this rule does not apply. If the
project shows no version marker or changelog anywhere in the diff or its context,
report one SUGGESTION to introduce one rather than a breaking-change finding.

Severity guidance: a breaking change with no major bump is a **WARNING**. Escalate
to **CRITICAL** only when the diff itself labels a breaking change as a patch or
minor release (for example a `Fixed` changelog line plus a patch bump), because that
is a false compatibility claim consumers will trust. Missing changelog text alone is
a **SUGGESTION**.

## Good
The breaking rename ships with a major bump and a changelog entry that names it.

```diff
 // package.json
-  "version": "1.3.0",
+  "version": "2.0.0",
```

```diff
 # CHANGELOG.md
+## 2.0.0
+### Breaking
+- `GET /v1/orders/:id`: response field `total` renamed to `amount`; `currency` removed.
+  Migration: read `amount`; see /v2/orders/:orderId.
```

```diff
 # openapi.yaml
 info:
-  version: 1.3.0
+  version: 2.0.0
```

## Bad
The response field is renamed, and the release is described as a patch fix.

```diff
 // package.json
-  "version": "1.3.0",
+  "version": "1.3.1",
```

```diff
 # CHANGELOG.md
+## 1.3.1
+### Fixed
+- Renamed `total` to `amount` in the order response.
```

A breaking rename that ships with no change to `package.json`, `openapi.yaml` or
`CHANGELOG.md` at all is also a violation: report which version files are missing
from the diff.
