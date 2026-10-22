# Zod at the edges

Validate where untrusted data **enters** the onion; inside, trust the types. "Parse, don't
validate": turn unknown input into a typed value once, at the boundary, and pass that value inward.

| Edge | Where it is parsed | How |
|---|---|---|
| HTTP params / body / query | `routes.ts` route `schema` | `fastify-type-provider-zod` — automatic `422` |
| Env / config | `platform/config.ts` | parse once at boot → `AppConfig` |
| `jsonb` read from Postgres | `repository.ts` | `Schema.parse` / `safeParse` with a fallback for old rows |
| LLM structured output | `reviewer-core` structured helpers | schema-guided parse + repair |
| Third-party API payloads | the adapter | map SDK shape → contract; parse if the shape is not guaranteed |
| Job payloads from `jobs` table | the job handler in the service | parse the payload before use |

## Rules

- **One contract, one source.** Request/response shapes are Zod schemas in
  `server/src/vendor/shared/contracts`; types are `z.infer`. Don't redeclare a parallel TS
  interface in a module.
- **No Zod parsing in ring 1–3 for data already parsed at an edge.** A service receiving
  `RepoInput` does not re-parse it.
- **Domain errors are not Zod errors.** A rule violation found by a service throws
  `ValidationError` / `AppError`, not `ZodError`.
- **Contracts are ring 1** — they must not import server code. Changing one → mirror it in
  `client/src/vendor/shared`.

## Sources

- Alexis King — [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
