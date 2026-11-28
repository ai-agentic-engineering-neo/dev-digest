---
name: response-schema
description: Flag response shape changes that existing callers notice - a field retyped, removed, moved, renamed, or switched between required and optional/nullable - and compare the server schema with what the client parses.
type: security
---
# response-schema

## Rules
- Compare the response schema (Zod, JSON schema, TypeScript return type) before
  and after. Report:
  - a field removed or renamed (CRITICAL);
  - a type change, e.g. `number` → `string`, object → array (CRITICAL);
  - required → optional or nullable: callers that read it without a check break
    (WARNING, CRITICAL when the client in the diff reads it unguarded);
  - optional → required in a request body (CRITICAL).
- When the repo keeps two copies of a shared contract (server and client), a
  change to one copy only is a mismatch. Cite both files.
- Adding a new optional field is not a finding.

## Good (not a finding)
```ts
export const Repo = z.object({
  id: z.string(),
  full_name: z.string(),
  stars: z.number().optional(), // new, optional
});
```

## Bad
```diff
 export const PrMeta = z.object({
-  score: z.number(),
+  score: z.number().nullable(),
 });
```
The client renders `pr.score.toFixed(0)`, which now throws on `null`.
