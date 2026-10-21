# Dependency injection and the test pyramid

## One composition root

`platform/container.ts` is the composition root (Seemann): the only file that
knows both an interface and the class that implements it. It builds driven
adapters lazily, checks `ContainerOverrides` first, and exposes repositories
through their port type:

```ts
// container.ts (root)
import type { SkillsRepositoryPort } from '../modules/skills/ports.js';
import { SkillsRepository } from '../modules/skills/repository.js';

private _skillsRepo?: SkillsRepositoryPort;
get skillsRepo(): SkillsRepositoryPort {
  return (this._skillsRepo ??= this.overrides.skillsRepo ?? new SkillsRepository(this.db));
}
```

The root may import anything. Nothing below the root imports it except
`routes.ts` (through `app.container`) and `_shared/context.ts`.

## Services take explicit deps

```ts
// ports.ts (ring 1)
export interface SkillsDeps { repo: SkillsRepositoryPort }

// service.ts (ring 2)
export class SkillsService {
  constructor(private readonly deps: SkillsDeps) {}
}

// routes.ts (ring 3b)
const service = new SkillsService({ repo: app.container.skillsRepo });
```

Why not `constructor(container: Container)` as the legacy services do: the
signature says nothing about what the service uses, a test has to build or
cast a whole container (`{ db } as unknown as Container` in
`agents-versions.it.test.ts`), and any service can reach `container.db` and
bypass its repository. With a deps object the compiler lists the real
dependencies, a fake is an object literal, and the service physically cannot
see Drizzle.

Adapters the service calls lazily (GitHub client that needs a token) are
passed as thunks: `github: () => Promise<GitHubClient>`.

## Fakes per ring

| Ring under test | Double | Where |
|---|---|---|
| Service | In-memory fake of the port (`class InMemorySkillsRepo implements SkillsRepositoryPort`) | beside the test, or `test/helpers/` when reused |
| Service that uses adapters | `adapters/mocks.ts` (`MockLLMProvider`, `MockGitHubClient`, …) passed in the deps object | existing |
| Repository | none: real Postgres via Testcontainers, `*.it.test.ts` | `test/helpers/pg.ts` |
| Route | `buildApp({ config, overrides })` + `app.inject()`; drivers mocked through `ContainerOverrides` | `test/routes-smoke.test.ts` |
| Adapter | contract test against the real SDK behind an env flag, or a recorded fixture | `test/adapters.test.ts` |

Test tiers by cost: service unit tests are milliseconds and need nothing;
they are where business rules live. Repository tests prove the SQL. Route
tests prove the HTTP contract. Do not test a business rule through
`inject()` when the service can be called directly.

## What a port must not contain

A port is a TypeScript interface plus the DTO and input types it mentions.
No default implementation, no `Db`, no `FastifyRequest`, no `Container`, no
Drizzle column types. If a port needs a constant (an enum of statuses), the
constant lives in `constants.ts` of the same module and the port imports it.

## Cross-module needs

A service that needs another module's data (reviews needs agents) does not
import that module. The container already exposes `agentsRepo` and
`reviewRepo`; add the port to the deps object and let `routes.ts` pass
`app.container.agentsRepo`. Cross-cutting facades (`RepoIntel`) follow the same
route: defined as an interface in the owning module's `types.ts`, exposed on
the container, injected.
