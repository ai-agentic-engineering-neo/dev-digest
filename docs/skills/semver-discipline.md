---
name: semver-discipline
description: Use when the diff changes a versioned API or package - a published library, SDK, versioned route (/v1), OpenAPI spec, or a package.json/CHANGELOG version. Flag a breaking change that ships without a MAJOR bump (or a new API version), and a version bump that doesn't match the change.
type: rubric
---
# Semver discipline — does this change need a MAJOR bump?

Semantic versioning is a promise to callers: `MAJOR.MINOR.PATCH`.
- **MAJOR** — any change that can break an existing, correct caller (see the
  `breaking-change` and `response-schema` skills): removed/renamed API, new
  required input, narrowed input, changed output type/shape/nullability, changed
  default or semantics, dropped runtime/platform support.
- **MINOR** — backward-compatible additions: new endpoint/export, new optional
  input, new optional output field, a deprecation notice.
- **PATCH** — backward-compatible fixes with no API change.

For HTTP APIs versioned in the path or a header, MAJOR means a **new version**
(`/v2/...`) next to the old one — not an in-place edit of `/v1`.

Check, when the diff contains a breaking change to a versioned surface:
- Is the version bumped to the next MAJOR (`1.4.2` → `2.0.0`), or is a new API
  version introduced while the old one keeps serving?
- Does the CHANGELOG / release note list the change under breaking changes, with
  a migration step?
- Conversely: a MAJOR bump with no breaking change, or a MINOR/PATCH bump that
  hides one.

Pre-1.0 (`0.y.z`) packages may break on MINOR — flag only a PATCH that breaks.
Skip this skill for code that has no external version (internal modules,
unpublished apps whose only caller ships in the same deploy).

## Example

Bad — removes an export and bumps PATCH:
```diff
 // package.json
-  "version": "1.4.2",
+  "version": "1.4.3",
 // src/index.ts
-export function parseConfig(path: string): Config { … }
+export function loadConfig(path: string): Config { … }
```
Every consumer on `^1.4.0` auto-upgrades to 1.4.3 and fails with
`parseConfig is not a function`.

Good — additive in a MINOR, removal deferred to the next MAJOR:
```diff
-  "version": "1.4.2",
+  "version": "1.5.0",
+export function loadConfig(path: string): Config { … }
+/** @deprecated Use loadConfig. Removed in 2.0.0. */
+export const parseConfig = loadConfig;
```

## Report
- CRITICAL — a breaking change to a published package or versioned API ships
  under a MINOR/PATCH bump (or edits a live API version in place): caret/tilde
  ranges will pull it in automatically.
- WARNING — breaking change with a MAJOR bump but no CHANGELOG / migration note,
  or a version bump that doesn't match the change.
- Cite the version line (or the breaking line when there is no bump). State the
  bump the change requires and why; suggest the additive MINOR alternative when
  one exists.
