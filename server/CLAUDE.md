# `server/` — @devdigest/api

Fastify API + Drizzle/Postgres. Imports repos & PRs, runs `repo-intel`, wires
`reviewer-core` to an LLM. Full docs: [`README.md`](README.md). Deeper notes:
[`docs/`](docs/) · [`specs/`](specs/) · [`INSIGHTS.md`](INSIGHTS.md).

## Stack

Node ≥22 · pnpm ≥10 · TypeScript 5.7 · Fastify 5 · Drizzle ORM 0.38 + `postgres`
3.4 (pgvector) · `fastify-type-provider-zod` 4 · `fastify-sse-v2` · `octokit` 4 ·
`simple-git` 3.27 · `@ast-grep/napi` 0.43 + `@vscode/ripgrep` + `dependency-cruiser`
17 + `graphology` 0.26 (repo-intel) · `openai` 4.77 / `@anthropic-ai/sdk` 0.33 ·
`js-tiktoken` · `zod` 3.24 · `vitest` 2.1 + `testcontainers`.

## Commands

```
pnpm dev                                             # API on :3001
pnpm db:generate / db:migrate / db:seed
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'     # unit, no Docker
pnpm exec vitest run .it.test                        # integration, needs Docker
pnpm test                                            # both
```

## Map

- `platform/` — config (`loadConfig`), DI container
- `adapters/` — llm · github · git · astgrep · secrets · tokenizer · embedder ·
  codeindex · depgraph — ports swapped for `adapters/mocks.ts` in tests
- `prompts/` — built-in agent system prompts
- `db/migrations/`, `db/schema/`
- `modules/` — one Fastify plugin per feature (`repos`, `pulls`, `polling`,
  `reviews`, `agents`, `settings`, `workspace`, `repo-intel`, `_shared`),
  registered in `modules/index.ts`
- `vendor/shared/` — `@devdigest/shared` (Zod contracts), vendored in

## Conventions & gotchas (non-default, not guessable from the code)

- Migrations are **not** applied on boot — run `pnpm db:migrate` manually.
- Secrets live in `~/.devdigest/secrets.json` (mode `0600`) via
  `LocalSecretsProvider`, never in git or the DB. `GITHUB_TOKEN` is canonical,
  `GITHUB_PAT` is a fallback.
- `REPO_INTEL_ENABLED` defaults **true**; `EMBEDDINGS_ENABLED` defaults
  **false** (off = zero OpenAI calls).
- Grounding is mandatory: `groundFindings()` drops any finding that cites a
  line not in the diff, and the score is recomputed from survivors — the
  model's self-reported score is never trusted.
- `INJECTION_GUARD` (`reviewer-core/src/prompt.ts`) is the one shared,
  trusted defense against prompt injection. Don't add a keyword denylist —
  it only ever catches one phrasing.
- `reviewer-core` is consumed as TS **source** via a tsconfig path alias, not
  a build artifact.
- `server/package.json` is `skip-worktree` (local variant diverges); CI runs
  the vitest split directly rather than via committed `test:*` scripts.

## Do not touch

- `server/clones/**` — runtime clone data, git-ignored, never collected by
  any test suite.
- `~/.devdigest/secrets.json` — never commit.
