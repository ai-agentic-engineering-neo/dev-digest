---
name: deprecation-policy
description: Flag a removed or renamed API field that skips a deprecation window instead of being marked deprecated and kept for at least one release.
type: convention
---

# Deprecation Policy

When a field genuinely needs to go away or change meaning, the safe path is
never "replace it in place this PR." It is: keep the old field working,
mark it deprecated (a comment, a `@deprecated` JSDoc tag, or an explicit
note in the contract file), ship the new field or shape alongside it for at
least one release, and only remove the old one in a later, separate change
once nothing depends on it anymore. Your job is to catch the shortcut: a
field disappearing or changing meaning in the same diff that introduces its
replacement, with no deprecation window at all.

## What to look for

- A response field is deleted and a differently-named or differently-shaped
  field appears in the same diff, with no transition period.
- A field's *meaning* changes (same name, different semantics) rather than
  its name — this is worse, because nothing in the diff even signals a
  break to a reader skimming field names.
- No `@deprecated` marker, changelog entry, or comment anywhere in the diff
  acknowledging that an existing consumer-visible field is going away.

## Good — old field deprecated, not deleted

```ts
export const SecretsStatus = z.object({
  /** @deprecated use `openai_detail.configured` instead; removed in a future release. */
  openai: z.boolean(),
  openai_detail: z.object({ configured: z.boolean() }),
});

app.get('/settings/secrets-status', async (req) => {
  ...
  return {
    ...legacy,                 // still populated for old consumers
    openai_detail: { configured: Boolean(value) },
  };
});
```
A consumer on the old contract keeps working unmodified; a new consumer can
move to the richer shape whenever it wants. The removal of `openai` itself
becomes a separate, later, deliberate change.

## Bad — silent replace-in-place

```ts
-export const SecretsStatus = z.object({ openai: z.boolean(), ... });
+export const SecretsStatus = z.object({ openai: z.object({ configured: z.boolean() }), ... });
```
`openai: boolean` is gone the instant this merges. Nothing in the diff
marks it deprecated, nothing kept it around for a release, and nothing
tells a reader that any existing caller of `GET /settings/secrets-status`
just broke. There is no way to distinguish "we decided this was safe to
remove" from "nobody thought about existing consumers at all."

## What to report

Name the field that disappeared or changed meaning, and confirm there is no
deprecation marker, transition period, or old-shape fallback anywhere in
the diff. State plainly that the field should have been added ALONGSIDE the
old one first, with removal left for a later change.
