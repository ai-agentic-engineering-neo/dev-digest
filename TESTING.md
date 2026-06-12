# Testing & CI strategy

DevDigest is five independent packages (no workspace), so testing is organised
as **one suite per package**, each with its own CI workflow, runner, and path
filter. A package's suite runs only when that package (or a package it depends
on at type-check time) changes.

## Philosophy — typological, not exhaustive

We do **not** chase line coverage. Each suite covers the *kinds* of things that
can break in that layer — one happy path plus the edge that actually matters per
workflow — and deliberately skips the rest. Concretely:

- **Test behaviour at the seams**, not implementation details. Routes, adapters,
  contracts, the review pipeline, the rendered component.
- **Mock the outside world.** LLMs, GitHub, embeddings, and git are stubbed via
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
| server-unit | `server/` | unit (hermetic) | vitest (`test:unit`) | `server-unit.yml` | no |
| server-integration | `server/` | integration (real Postgres) | vitest (`test:integration`) | `server-integration.yml` | **yes** |
| reviewer-core | `reviewer-core/` | unit (engine) | vitest | `reviewer-core.yml` | no |
| agent-runner | `agent-runner/` | unit + bundle smoke | vitest + ncc | `agent-runner.yml` | no |
| mcp | `mcp/` | smoke (helpers + contracts) | vitest | `mcp.yml` | no |
| e2e web | `e2e/` | browser e2e (deterministic) | agent-browser + `run.ts` | `e2e-web.yml` | yes (stack) |

The dogfooding AI reviewer (`devdigest-review.yml`) is separate — it runs the
DevDigest agents on each PR and is not part of this test taxonomy.

## What each suite covers

**client** — components render and react to interaction (React Testing Library
+ jsdom). `fetch` is mocked; no API, DB, or browser. ~35 component tests over
the PR-review surface, agents, skills, memory, eval, conformance, etc.

**server-unit** — the DB-free majority (~19 files): adapters, prompt assembly,
extract/grounding, repo-intel ranking & phantom detection, pricing, route smoke.
The `typecheck` job also runs on Windows, which doubles as the `@ast-grep/napi`
prebuilt gate (install fails there if the win32 prebuilt is missing).

**server-integration** — the 12 `*.it.test.ts` files. Each starts a real
Postgres (pgvector) via testcontainers, builds the Fastify app, migrates +
seeds, and drives routes end-to-end: reviews, run lifecycle, conventions,
skills, eval-CI, blast/brief, symbol clamping, memory, productionize, pulls
comments, settings models. They self-skip when Docker is unavailable.

**reviewer-core** — the pure engine: `toReview` selection, prompt construction,
and a `run` with a stubbed model → grounded findings. No DB / GitHub / FS.

**agent-runner** — the GitHub Action IO wrapper: github adapter, local/main
entrypoints, `review-pr`. Plus a build smoke that `ncc` still bundles a
non-empty `dist/index.js` (we don't byte-diff — ncc output isn't reproducible
across environments; the committed `dist/` invariant is documented in
`agent-runner/README.md`).

**mcp** — a smoke test over the two pieces that carry logic: the local
working-tree helpers (`read_file` path-traversal guard) and the shared contract
barrel the tools serialize against. It never imports `server.ts` (that connects
a stdio transport on load).

**e2e web** — see `e2e/README.md`. Deterministic agent-browser flows over the
main journeys (boot → PR list → PR detail; agents; skills; dashboards) against a
real seeded stack. No `chat`, no model key.

## Running locally

```sh
# per package
cd client        && pnpm test           # + pnpm typecheck
cd reviewer-core && npm test
cd agent-runner  && npm test
cd mcp           && pnpm test

# server — the unit/integration split (see note below)
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
cd server && pnpm exec vitest run .it.test                      # integration, needs Docker
cd server && pnpm test                                          # both

# browser e2e (needs the full stack + agent-browser CLI)
./scripts/dev.sh
npm i -g agent-browser && agent-browser install
cd e2e && npm install && npm test
```

## Conventions

- **Integration tests end in `*.it.test.ts`.** The unit lane excludes that glob
  (`vitest run --exclude '**/*.it.test.ts'`); the integration lane selects only
  it (`vitest run .it.test`). A DB-backed test that imports `test/helpers/pg.ts`
  must use the `.it.test.ts` suffix.
- **`server/package.json` is `skip-worktree`** (a local variant diverges from the
  committed file). CI therefore invokes the split with
  `pnpm exec vitest run …` rather than relying on committed `test:unit` /
  `test:integration` scripts. Those scripts may exist locally as a convenience;
  the `pnpm exec` form is the canonical, checkout-independent invocation.
- **Hermetic by default.** Reach for `src/adapters/mocks.ts` (MockLLMProvider,
  MockEmbedder, MockGitClient) rather than real network/keys.
- **E2E specs are deterministic batch JSON** (`e2e/specs/*.flow.json`) using
  only `--url` / `--text` / `find` locators — never the AI `chat` command.
- **CI is path-filtered per package.** Cross-package source aliases are encoded
  in each workflow's `paths:` (e.g. `reviewer-core/**` triggers `server-unit`
  because the server type-checks against `../reviewer-core/src`).
- **`server/clones/**` is runtime data** (git-ignored) and never collected by
  any suite.
