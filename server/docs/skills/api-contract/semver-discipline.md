---
name: semver-discipline
description: Judge whether an API shape change is additive (safe) or breaking (needs a version bump, a new route, or a deprecation path) — and flag a breaking change shipped as if it were additive.
type: convention
---

# Semver Discipline

Not every contract change is equally dangerous. Your job is to classify the
change and flag the ones that are breaking but were made as casually as an
additive one — no new route, no version segment, no deprecation window,
just an in-place edit to an existing endpoint's shape.

## Additive (non-breaking) — usually fine as an in-place edit

- A new optional field added to a response object.
- A new optional query parameter or request field with a sensible default
  when absent.
- A new endpoint entirely.

## Breaking — needs a version bump, a new route, or an explicit migration path

- A field is removed or renamed.
- A field's type changes in a way an existing consumer's parser would
  reject or misread (`boolean` → object, `string` → `string | null` where
  the consumer never null-checked, a required field becoming absent).
- A previously-flat response becomes nested, or vice versa.
- An enum gains or loses a value that a consumer's exhaustive `switch`
  depends on.

## Good — a breaking shape change takes a path that doesn't strand existing callers

```ts
// Old field kept, new field added alongside it — additive from the
// consumer's point of view, even though the "real" data model changed.
export const SecretsStatus = z.object({
  openai: z.boolean(),               // kept for existing consumers
  openai_detail: z.object({ configured: z.boolean() }).optional(), // new
});
```
or, when the old shape truly cannot be kept: a new route
(`/settings/secrets-status/v2`) or a documented breaking-change entry so
consumers can be migrated deliberately, not by surprise.

## Bad — a breaking change made as if it were a one-line tweak

```ts
-export const SecretsStatus = z.object({ openai: z.boolean(), ... });
+export const SecretsStatus = z.object({ openai: z.object({ configured: z.boolean() }), ... });
```
This silently changes `openai: boolean` (a primitive every existing
consumer reads directly) into `openai: { configured: boolean }` on the SAME
endpoint, with no new route, no version marker, and no fallback for a
consumer still expecting the old primitive. Any client still on the old
contract now gets `if (status.openai)` evaluating to `true` for a truthy
object regardless of whether the key is actually configured — the worst
kind of breaking change, one that doesn't throw, it lies.

## What to report

State which category the change falls into and why. For a breaking change,
name the concrete consumer-visible failure mode (a truthy-object bug like
the one above, a parse exception, a field a consumer reads that no longer
exists) and note the absence of any version marker, new route, or
deprecation path that would have made the change safe.
