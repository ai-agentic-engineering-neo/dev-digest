---
name: semver-discipline
description: Apply when a diff changes a public API or contract; check that the version bump and changelog entry match the change (breaking = major, new capability = minor, fix = patch).
type: rubric
---
# Semver discipline

The version number is the contract's promise to consumers. A breaking change under a
minor or patch bump is a broken promise, even if the code is correct.

## Rules
- **MAJOR**: any change that can break an existing client (removed or renamed route,
  field or enum value; new required input; stricter validation; type or nullability
  change; changed status code or error shape).
- **MINOR**: backwards-compatible new capability (new route, new optional field,
  new response field, a deprecation notice).
- **PATCH**: backwards-compatible fix with no contract change.
- Pre-1.0 (`0.y.z`) still signals: breaking goes to `y`, everything else to `z`.
- Deprecation itself is MINOR; the removal that follows is MAJOR.

## Procedure
1. Decide the correct bump from the diff using the rules above (take the highest
   level of any change in the diff).
2. Find the bump: `package.json` `version`, a `CHANGELOG.md` entry, an API version
   constant, or a release note in the PR description.
3. Compare. Missing, or lower than required, is a finding. A bump that is higher
   than needed is only a SUGGESTION.
4. Check the changelog names the breaking change and the migration.

## Example
Bad: a field is removed, the package goes `2.3.0` to `2.3.1`, no changelog.
```diff
- "version": "2.3.0",
+ "version": "2.3.1",
```
```ts
- cost: z.number(),   // removed
```
Good: the removal is a major bump with a migration note.
```diff
- "version": "2.3.0",
+ "version": "3.0.0",
```
```md
## 3.0.0
- BREAKING: `Run.cost` removed; use `Run.cost_usd` (available since 2.2.0).
```

## How to report
- Cite the version line (or the line that changes the contract if no bump exists).
- State the required bump and why ("removed field = breaking = major").
- Fix: bump to the required level and add a changelog entry with the migration.

## Severity guidance
- CRITICAL: a breaking change with no major bump on a published or shared contract.
- WARNING: missing or insufficient bump on a non-published internal contract, or a
  breaking change without a changelog entry.
- SUGGESTION: a bump larger than needed, or a missing changelog on a safe change.
