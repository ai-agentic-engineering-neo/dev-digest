# server — Fastify API :3001, listens on 127.0.0.1 only. Contains NO review logic (that lives in ../reviewer-core).

## Stack
Fastify 5 · Drizzle 0.45 + Postgres 16/pgvector · Zod 3.25 · fastify-type-provider-zod 4 · fastify-sse-v2 · p-queue · vitest 2 · pnpm

## Commands
- `pnpm typecheck` · `pnpm test` (unit + integration)
- unit without Docker: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration (Docker): `pnpm exec vitest run .it.test`
- architecture gate: `pnpm exec vitest run test/architecture.test.ts` (readable: `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`); baseline only shrinks — skill `onion-architecture`
- Migrations are not automatic: `pnpm db:generate` → `pnpm db:migrate`; `pnpm db:seed` is idempotent

## Map
- src/modules/<feature>/ — routes → service → repository; static registry: modules/index.ts
- src/platform/container.ts — DI composition root; local-only.ts — Host/Origin guard
- src/adapters/ — github, git, llm, astgrep, depgraph, tokenizer, secrets (mocks: adapters/mocks.ts)
- src/db/schema/ — tables for ALL milestones up front, most of them empty — by design
- src/vendor/shared/ — Zod contracts (sync rule — in the root CLAUDE.md)

## Conventions
- All documentation is written in English (CLAUDE.md, README, specs, INSIGHTS, code comments)
- Adapters and shared repositories — only via `container.*`, no `new` inside a module
- A module never imports from another module's folder
- New module → register it in modules/index.ts (@fastify/autoload is in deps but unused)
- A test that imports test/helpers/pg.ts must have the `*.it.test.ts` suffix
- Tests are hermetic: MockLLMProvider / MockGitClient from adapters/mocks.ts, no network or keys

## Gotchas
- package.json is `skip-worktree` (the local variant differs) — don't rely on the test:unit/test:integration scripts
- Review runs as `void executeRuns()` in-process; clone/index go through JobRunner (p-queue + jobs table). These are different mechanisms
- RunBus lives in memory: a server restart = lost live log; "orphaned" runs are cleaned up by the reaper on startup
- No repo-intel index → the review runs on the diff alone, without an error
- server/clones/** — runtime data, git-ignored

## Do not touch
- platform/local-only.ts, binding to 127.0.0.1, helmet / rate-limit — protection against DNS rebinding
- platform/grounding.ts, platform/prompt.ts — shims over reviewer-core; change the logic there, not here

## Read when
- Before adding or changing a route → read README.md ("API map", "Request & DI flow")
- Before changing what goes into the review prompt → read README.md ("Review context")
- Before changing env/config → read README.md ("Environment")
- Before adding a module, service, repository, adapter or port, or reviewing a backend diff → skill `onion-architecture` (layering rules; most modules are legacy — see its migration policy)
- Before changing repo-intel → read src/modules/repo-intel/README.md
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before editing anything here → read INSIGHTS.md

## Insights
This package's lessons live in INSIGHTS.md (append-only, 7 sections). Hooks handle reading at the start and the wrap-up at the end; selection rules, format and writing — skill `engineering-insights` (`/engineering-insights`, `/engineering-insights review`).
An entry that fired twice → move it to Gotchas and mark it in INSIGHTS with a new entry `(→ CLAUDE.md)`.
