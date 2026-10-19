---
name: deprecation-policy
description: Use when the diff removes, renames or replaces a public route, field, parameter, export or config option. Flag silent removal - the old contract must first be marked deprecated, keep working, point to its replacement and state when it goes away.
type: convention
---
# Deprecation policy — deprecate first, remove later

Callers you can't see need time to migrate. A public route, field, parameter,
export or config option is never removed or renamed in one step. Instead:

1. **Keep it working** — the old name is an alias / adapter over the new one, and
   both return the same result.
2. **Mark it** where callers will see it:
   - TypeScript/JS export or field: a `/** @deprecated Use X. Removed in vN. */`
     JSDoc tag.
   - Schema / OpenAPI: `deprecated: true` (zod: `.describe('Deprecated: use X')`).
   - HTTP route: a `Deprecation` header (and `Sunset: <date>` when the date is
     known) plus a log/metric of who still calls it.
   - Config / CLI flag: a one-time warning at startup naming the replacement.
3. **Point to the replacement** and **state the removal** — a version (next
   MAJOR) or a date. "Deprecated" with no replacement or timeline is not enough.
4. **Remove only** in a later release that is allowed to break (see
   `semver-discipline`), after the CHANGELOG has announced it.

Flag:
- Removal or rename of a public item that was not deprecated in an earlier
  release (check the removed lines for an existing `@deprecated` / `deprecated`).
- A deprecation without a replacement or without a removal version/date.
- A deprecated alias that behaves differently from its replacement.
- Removal of a deprecated item before its announced version/date.

## Example

Bad — the field is renamed silently:
```diff
 export const Agent = z.object({
-  model_name: z.string(),
+  model: z.string(),
 });
```

Good — the new field is added and the old one is kept, marked and still filled:
```diff
 export const Agent = z.object({
+  model: z.string(),
-  model_name: z.string(),
+  model_name: z.string().describe('Deprecated: use `model`. Removed in v3.'),
 });
 const toDto = (r) => ({
+  model: r.model,
   model_name: r.model, // same value until v3
 });
```

## Report
- WARNING — silent removal/rename, a deprecation missing a replacement or a
  timeline, or an alias that diverges from its replacement. If the removal also
  breaks a caller visible in the repo, the `breaking-change` skill decides CRITICAL.
- SUGGESTION — the deprecation is correct but could be more visible (add the
  header/log, add the CHANGELOG entry).
- Cite the removed or deprecated line. Suggest the alias + marker + removal
  version, written out.
