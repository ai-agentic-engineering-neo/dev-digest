---
name: breaking-change
description: Flag any changed route handler whose request or response shape changed without the matching contract/schema also changing in the diff.
type: convention
---

# Breaking Change Detector

A route handler's actual return value and its declared contract (a Zod
schema, a shared TypeScript type, a hand-written DTO interface) are two
separate pieces of text that the compiler does not force to move together.
Your job is to catch the moment they diverge: a handler's response or
accepted request body changes shape, but the type that names that shape in
the diff does not change alongside it — or changes in a way that does not
match what the handler now actually returns.

## What counts as a shape change

- A field is added, removed, renamed, or its type changes (e.g. `boolean` →
  `{ configured: boolean }`, `string` → `string | null`, a flat field moving
  into a nested object).
- An array becomes an object keyed by id, or vice versa.
- A previously-required response field becomes optional, or an
  previously-nullable field becomes required, without the schema changing to
  match.

## Good — shape change ships with its contract

```ts
// contracts/platform.ts
-export const SecretsStatus = z.object({ openai: z.boolean(), ... });
+export const SecretsStatus = z.object({
+  openai: z.object({ configured: z.boolean() }),
+  ...
+});

// routes.ts
 app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
   ...
-  return [provider, Boolean(await container.secrets.get(key))] as const;
+  return [provider, { configured: Boolean(await container.secrets.get(key)) }] as const;
```
Both files move in the same diff — the declared type and the real return
value never disagree.

## Bad — shape change with no contract update

```ts
// routes.ts only
 app.get('/settings/secrets-status', async (req) => {
   ...
-  return [provider, Boolean(await container.secrets.get(key))] as const;
+  return [provider, { configured: Boolean(await container.secrets.get(key)) }] as const;
   ...
-  return Object.fromEntries(entries) as SecretsStatus;
+  return Object.fromEntries(entries);
```
Notice the return type annotation was quietly dropped (`as SecretsStatus`
removed) rather than the schema being updated — a strong tell that the
handler's real shape and its contract have just been allowed to disagree.
`SecretsStatus` in `contracts/platform.ts` still says `z.boolean()` per
provider; every existing consumer of that contract (a generated client, a
test that asserts `typeof status.openai === 'boolean'`) is now silently
wrong.

## What to report

Cite the exact handler (file:line) whose returned or accepted shape
changed, and name the contract/schema file that should have changed
alongside it but did not — or state explicitly that no such file exists in
the diff at all. Describe the concrete field-level difference. Do not flag
a handler whose contract update is present elsewhere in the same diff.
