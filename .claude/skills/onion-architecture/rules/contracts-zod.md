# Zod & `@devdigest/shared` — contracts are DTOs at the boundary

`@devdigest/shared` (vendored at `src/vendor/shared`, mirrored into `client/src/vendor/shared`) is a **shared kernel**: it holds Zod contracts (API DTOs), value enums (`Provider`, `ReviewStrategy`, `CiFailOn`) and the port interfaces (`adapters.ts`).

## Rules

1. **Contracts are for the wire.** Request/response envelope schemas (`RepoInput`, `SettingsUpdate`, `RunRequest`, `Agent`, `Repo`, …) are the edge's vocabulary. They are snake_case (`full_name`, `clone_path`); persistence is camelCase. Do not let snake_case DTO fields become the domain model.
2. **Value enums may travel inward.** `Provider`, `ReviewStrategy`, `CiFailOn`, severities etc. are shared vocabulary; services and repositories can use them.
3. **Three shapes, two mappers.** `row (infra) ⇄ domain type ⇄ DTO (edge)`. Row→domain lives in the repository; domain→DTO in the module's `helpers.ts` (`toRepoDto`, `toAgentDto`, `reviewToDto`, `findingRowToDto`). Keep mappers named, pure, single-direction, unit-tested.
4. **Parse once, at the boundary** ("parse, don't validate"). The route schema turns untrusted JSON into a typed value; services accept the typed value and don't re-validate shape. Business-rule checks (uniqueness, state transitions) stay in the service and throw `ValidationError`.
5. **No duplicate input types.** `agents/routes.ts` defines `CreateAgentBody` and `agents/service.ts` re-declares `CreateAgentInput` — pick one source: define the schema in the module (or `@devdigest/shared`) and use `z.infer` as the service input type. Services must not import from `routes.ts`, so put shared schemas in `types.ts`/shared.
6. **External data is untrusted too.** LLM structured output, GitHub payloads, webhook bodies: parse with Zod inside the **adapter** (anti-corruption), return domain types.
7. **Config/secrets:** validate env/config once in `platform/config.ts`; secrets only via `SecretsProvider` (never `.env` reads in inner rings).
8. **Changing a contract:** edit `server/src/vendor/shared`, mirror to `client/src/vendor/shared` **by hand**, and bump nothing else — there is no workspace. Prefer additive/optional fields.

## Anti-patterns

- Service signature `create(input: z.infer<typeof CreateAgentBody>)` importing the route file → move the schema out of `routes.ts`.
- Returning a DB row from a handler and hoping the serializer hides fields → map to the DTO explicitly.
- `z.any()` / `z.unknown()` leaking into domain code (`output_schema: z.unknown()` is a boundary escape hatch — narrow it in the service).

## Sources

Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) · Khalil Stemmler, [DTOs, Mappers & Repository](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) · Skill: `zod` for schema API.
