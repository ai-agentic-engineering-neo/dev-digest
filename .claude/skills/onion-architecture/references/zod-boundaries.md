# zod at the boundaries

"Parse, don't validate" (Alexis King): turn untrusted input into a precise type
**once, at the edge**; everything inside trusts the type and never re-checks.

## Three kinds of shapes — keep them apart

| Shape | Lives in | Owned by | zod? |
|-------|----------|----------|------|
| **Wire contract** (request/response DTO, snake_case) | `src/vendor/shared/contracts/*` — **two copies** (server + client), change both | API ↔ client agreement | yes — schemas + `z.infer` types |
| **Read model / domain type** (camelCase, `Date`, unions) | `ports.ts` / `domain.ts` | the module | no — plain TS types |
| **Row** (`$inferSelect`) | private to the repository | Drizzle | n/a |

Mapping: contract → service input (route) · read model ↔ row (repository) ·
read model → contract (`toXDto` in `helpers.ts`).

## Rules

1. **Routes declare schemas**; the type provider parses before the handler
   runs. No `parse` inside handlers (repo rule).
2. **Services accept typed arguments**, not `unknown`. They don't call
   `Contract.parse` on data a route already parsed.
3. **Domain never imports runtime zod or runtime contracts** —
   `domain-is-pure` / `domain-contracts-type-only`. `import type { Provider } from '@devdigest/shared'`
   is fine for shared enums/unions.
4. **Parse every other untrusted edge too**, in the adapter that receives it:
   LLM structured output (reviewer-core already does this), GitHub/SDK payloads
   you depend on, job payloads read back from the DB, jsonb columns
   (default missing fields on read — see `server/INSIGHTS.md`, `getRunTrace`).
5. **Don't make the contract your domain model.** When the wire shape and the
   business shape diverge (naming, optionality, `string` dates vs `Date`), map;
   don't bend the domain to snake_case.
6. **Value objects** that need validation (e.g. a repo URL) get a factory in
   `domain.ts`/`helpers.ts` (`parseRepoUrl` → typed result or domain error) —
   plain TS, optionally a branded type. zod stays at the edge.
