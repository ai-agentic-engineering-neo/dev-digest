---
name: response-schema
description: Verify a handler's actual returned object still matches the Zod schema or TS type that names it, field by field.
type: convention
---

# Response Schema Conformance

Where `breaking-change` catches "the shape changed and the contract didn't,"
this skill goes one level more literal: for every route handler touched in
the diff, mentally construct the object it actually returns and check it
against the Zod schema (or TS type) the diff says that handler returns —
even when the contract file WAS edited. A contract edit that doesn't
actually match the new runtime shape is just as broken as no edit at all.

## How to check

1. Find the handler's declared return type — a `Promise<SomeContract>`
   annotation, a `z.infer<typeof X>`, or the schema referenced by
   `{ schema: { response: ... } }` on the route.
2. Read the object literal / `Object.fromEntries` / spread the handler
   actually constructs.
3. Compare field-by-field: same keys, same nesting depth, same primitive vs.
   object vs. array shape. A dropped type annotation (`as SomeContract`
   removed, or the `Promise<X>` return type deleted from the handler
   signature) is itself a signal — it often means the author noticed the
   real value no longer fit the type and silently widened the signature
   instead of fixing the mismatch.

## Good

```ts
export const SecretsStatus = z.object({
  openai: z.object({ configured: z.boolean() }),
  anthropic: z.object({ configured: z.boolean() }),
});

app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
  ...
  return Object.fromEntries(entries) as SecretsStatus;
});
```
The handler keeps its `Promise<SecretsStatus>` annotation, and the object it
builds (`{ configured: boolean }` per provider) is exactly what that schema
now describes.

## Bad

```ts
app.get('/settings/secrets-status', async (req) => {
  ...
  const value = await container.secrets.get(key);
  return [provider, { configured: Boolean(value) }] as const;
  ...
  return Object.fromEntries(entries);
});
```
The return type annotation is gone entirely, so nothing forces this
handler's real output (`{ provider: { configured: boolean } }`) to line up
with `SecretsStatus` (`{ provider: boolean }`) at all — TypeScript will not
catch this because there is no annotation left to check against. This is
the pattern to flag even when a schema file exists somewhere in the repo:
the absence of a return-type annotation on a touched handler is itself
worth calling out, not just a schema that visibly disagrees.

## What to report

Name the handler and the schema/type it should conform to. State the exact
field-level mismatch (or the missing annotation that hides one), and what a
strict client parsing the old schema against the new response would
experience (a parse failure, a silently-dropped field, or a field it now
reads as the wrong type).
