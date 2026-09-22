# Testing & CI strategy

DevDigest is four independent packages (no workspace), so testing is organised
as **one suite per package**, each with its own CI workflow, runner, and path
filter. A package's suite runs only when that package (or a package it depends
on at type-check time) changes.

## Philosophy — typological, not exhaustive

We do **not** chase line coverage. Each suite covers the *kinds* of things that
can break in that layer — one happy path plus the edge that actually matters per
workflow — and deliberately skips the rest. Concretely:

- **Test behaviour at the seams**, not implementation details. Routes, adapters,
  contracts, the review pipeline, the rendered component.
- **Mock the outside world.** LLMs, GitHub, and git are stubbed via
  `server/src/adapters/mocks.ts` so unit tests are hermetic and key-free.
- **One real integration per data-backed workflow**, against a real Postgres —
  not a mock DB — because the bugs there live in SQL, migrations, and wiring.
- **A few end-to-end browser flows** over the *main* user journeys, on seeded
  data, with no LLM in the loop.

If a test wouldn't catch a class of regression we care about, we don't write it.

## Suite map

| Suite | Package | Kind | Runner | Workflow | Docker? |
|-------|---------|------|--------|----------|---------|
| client | `client/` | component / unit (jsdom) | vitest | `client.yml` | no |
| server-unit | `server/` | unit (hermetic) | vitest | `server-unit.yml` | no |
| server-integration | `server/` | integration (real Postgres) | vitest | `server-integration.yml` | **yes** |
| reviewer-core | `reviewer-core/` | unit (engine) | vitest | `reviewer-core.yml` | no |
| e2e web | `e2e/` | browser e2e (deterministic) | agent-browser + `run.ts` | `e2e-web.yml` | yes (stack) |
| shared drift | `server/` + `client/` vendor/shared | byte-identical copies | `scripts/check-shared-drift.sh` | `shared-drift.yml` | no |

Static gates run next to the tests in the same workflow: **typecheck** (every
package), **Biome lint** (`lint` script in every package; one root
`biome.jsonc`, linter only), and for the server the **onion-architecture check**
(`pnpm arch:check` = dependency-cruiser over `src` + `../reviewer-core/src`,
empty known-violations baseline).

## What each suite covers

**client** — components render and react to interaction (React Testing Library
+ jsdom). `fetch` is mocked; no API, DB, or browser. Covers the PR-review
surface (list, diff, findings, run controls) and the agent editor.

**server-unit** — the DB-free majority: adapters, prompt assembly, grounding,
repo-intel ranking & indexing, pricing, route smoke. CI (typecheck included)
runs on Linux only.

**server-integration** — the `*.it.test.ts` files. Each starts a real Postgres
(pgvector) via testcontainers, builds the Fastify app, migrates + seeds, and
drives routes end-to-end: reviews + run lifecycle (incl. grounding), agents CRUD,
repo-intel symbol clamping, pulls comments, settings models. They self-skip when
Docker is unavailable.

**reviewer-core** — the pure engine: `toReview` selection, prompt construction,
and a `run` with a stubbed model → grounded findings. No DB / GitHub / FS. Tests
use local fixtures (`test/fixtures/`), never server mocks; CI runs
`test:coverage` (v8 thresholds).

**e2e web** — see `e2e/README.md`. Deterministic agent-browser flows over the
main journeys (boot → PR list → PR detail; agents; run timeline; run a review →
live progress → findings; accept/dismiss) against a real seeded stack. No
`chat`, no model key: `./scripts/e2e.sh` starts the API with
`LLM_PROVIDER_OVERRIDE=mock` (a fixed, grounded review from
`server/src/adapters/llm/mock.ts`), and flows that start a review
(`"requiresEnv": "E2E_MOCK_LLM"`) are skipped on a stack without it.

## Running locally

```sh
# per package (each also has `typecheck` and `lint`)
cd client        && pnpm test
cd reviewer-core && npm test            # CI: npm run test:coverage

# server — the unit/integration split (see Conventions)
cd server && pnpm test:unit             # vitest run --exclude '**/*.it.test.ts' — no Docker
cd server && pnpm test:integration      # vitest run .it.test — needs Docker
cd server && pnpm test                  # both
cd server && pnpm arch:check            # dependency-cruiser layering rules

# shared contracts (server copy is the source of truth)
./scripts/check-shared-drift.sh

# browser e2e (isolated stack on alt ports + agent-browser CLI)
npm i -g agent-browser@0.27.0 && agent-browser install
cd e2e && npm ci && cd .. && ./scripts/e2e.sh
```

## Conventions

- **Integration tests end in `*.it.test.ts`.** The unit lane excludes that glob
  (`vitest run --exclude '**/*.it.test.ts'`); the integration lane selects only
  it (`vitest run .it.test`). A DB-backed test that imports `test/helpers/pg.ts`
  must use the `.it.test.ts` suffix.
- **CI calls package scripts** (`pnpm test:unit`, `pnpm test:integration`,
  `pnpm lint`, …), so the command a workflow runs is the one you run locally.
- **Toolchain is pinned**: Node from `.nvmrc` (`setup-node` reads it), pnpm from
  the `packageManager` field (`pnpm/action-setup` reads it), third-party
  actions by commit SHA (tag in a trailing comment), agent-browser by version.
- **Lint debt is explicit**: rules that fired on existing code are set to
  `info`/`off` in `biome.jsonc`. CI runs `biome lint --error-on-warnings`, so
  every other recommended rule blocks. Fix a debt rule's hits, then delete its
  override.
- **Hermetic by default.** Reach for `src/adapters/mocks.ts` (MockLLMProvider,
  MockGitClient) rather than real network/keys.
- **E2E flows are deterministic batch JSON** (`e2e/flows/*.flow.json`) using
  only `--url` / `--text` / `find` locators — never the AI `chat` command.
  Flows that write (run a review, accept/dismiss) rely on the hermetic runner's
  fresh seed and the mock LLM; never point them at a real provider.
- **CI is path-filtered per package.** Cross-package source aliases are encoded
  in each workflow's `paths:` (e.g. `reviewer-core/**` triggers `server-unit`
  because the server type-checks against `../reviewer-core/src`;
  `server/src/vendor/shared/**` triggers `reviewer-core`). `biome.jsonc` and
  `.nvmrc` trigger every workflow that uses them.
- **`server/clones/**` is runtime data** (git-ignored) and never collected by
  any suite.
