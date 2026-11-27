# Zod & contracts — the domain model and the trust boundaries

## `@devdigest/shared` is ring 1
`server/src/vendor/shared/contracts/*` (Zod schemas + `z.infer` types) is the vocabulary
every ring speaks. Therefore it must stay **dependency-free**: only `zod`, no Fastify,
Drizzle, Node APIs or SDK types.

- There are **two copies** (server + client) and they already differ — a contract change updates both and you diff them.
- `vendor/shared/adapters.ts` holds the **ports** (ring 2) and their data types (`RepoRef`, `UnifiedDiff`, `CompletionRequest`, …). Adapter-specific types (Octokit responses, simple-git results) never appear there.
- Module-private domain types go in `modules/<m>/types.ts`, not in shared, until the client needs them.

## Parse, don't validate — at every trust boundary
Parse once, at the edge, into a typed value; inside the core, trust the type. *(King)*

| Boundary | Where it is parsed | Ring |
|---|---|---|
| HTTP params/body/query | route `schema` (fastify-type-provider-zod) | 4 |
| LLM output | `parseWithRepair` / structured output in reviewer-core | 2 |
| jsonb read from DB | repository, with the current contract schema | 4 |
| Job payload (persisted JSON) | first line of the job handler | 3/4 |
| GitHub / git responses | inside the adapter, mapped to port types | 4 |
| Env / config | `platform/config.ts` | 4 |
| Secrets | `SecretsProvider` only | 4 |

Rules:
- **No `Schema.parse()` deep inside services or helpers** on data that already crossed a boundary — that duplicates validation and hides where trust starts.
- **Shape vs rules:** Zod checks shape at the boundary; business rules that need context (exists? belongs to workspace? status allows it?) live in the service/helper and throw `AppError`.
- **Author-controlled text going to an LLM** (PR body, diff, comments) goes through `wrapUntrusted()` — that is a boundary too, in the other direction.
- **Branded ids** (`type RepoId = string & { __brand: 'RepoId' }`) are optional; consider them when two id parameters of the same type sit next to each other in a port.
- `ValidationError` (422) is for domain-level validation failures; Fastify's schema errors stay 400.
