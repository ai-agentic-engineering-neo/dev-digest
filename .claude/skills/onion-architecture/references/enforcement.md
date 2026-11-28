# Enforcement — dependency-cruiser

Config: `server/.dependency-cruiser.cjs`. Command: `cd server && pnpm arch:check` (cruises `src` + `../reviewer-core/src`, ~1 s, uses the `dependency-cruiser` already in server deps).

## Rules
| Rule | Guards |
|---|---|
| `domain-model-is-pure` | runtime imports in `domain-model/` only from itself + `platform/errors.ts` |
| `domain-model-no-outer-types` | type-only imports from outer rings / Drizzle / Fastify |
| `domain-services-inward-only` | no application, infra, routes, db, container, SDK |
| `application-services-no-infra` | no infra, routes, db, Drizzle, adapters, container, Fastify, SDK |
| `infrastructure-no-ui` | infra doesn't import routes or Fastify |
| `routes-no-persistence` | `routes.ts` doesn't import Drizzle, `db/`, repositories |
| `legacy-service-no-drizzle` | legacy `service.ts` doesn't import Drizzle / `db/schema` |
| `drizzle-only-in-persistence` | Drizzle only in repositories / infrastructure |
| `sdk-only-in-adapters` | SDKs only in `src/adapters/**` |
| `reviewer-core-no-io` | engine has no fs/net/child_process/DB/server imports |
| `reviewer-core-sdk-only-in-llm-adapter` | `openai` only in `reviewer-core/src/llm/` |
| `no-circular` | cycles in `server/src` |

## Adoption policy (decision 2026-11-28: warnings only)
- Every rule is `severity: 'warn'` → the command prints violations and exits 0.
- Baseline at introduction: 14 warnings (Drizzle in `routes.ts` of `settings`, `polling`, `workspace`, `pulls`; `settings/feature-models.ts`; cycles `container ↔ repo-intel/service` and `agents/helpers ↔ agents/repository`).
- Don't add new warnings. When a rule's count reaches 0, propose flipping it to `error` (and only then wire it as a failing CI step — read `TESTING.md` first; workflows are in `.github/workflows/`, one per suite).
- `depcruise-baseline` (ships with dependency-cruiser) can freeze known violations if the team later wants `error` with a baseline.

## Verifying a rule
Create a throwaway module (`src/modules/zz-probe/domain-model/x.ts` importing `drizzle-orm`), run `pnpm arch:check | grep zz-probe`, delete it. Did this at introduction: domain-model and application-services rules fired as expected.

## Limits
dependency-cruiser sees imports, not behaviour: `process.env` reads, `container.*` access through a passed object, or `as` casts on payloads are review-checklist items, not lint rules.
