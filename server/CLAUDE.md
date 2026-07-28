# server/CLAUDE.md — `@devdigest/api`

Stack, DI flow diagram, API map, env table: [README.md](README.md). This file
only adds what an agent working in this folder wouldn't guess from the README.

Read [LEARNINGS.md](LEARNINGS.md) before starting work here — treat it as
high-confidence guidance unless it's obviously stale. It also covers
`src/modules/repo-intel` (no separate file for that submodule).

## Non-default conventions

- Routes are schema-first: every route declares zod `params`/`body`
  (`fastify-type-provider-zod`) — handlers never hand-roll
  `Schema.parse(req.body)`; invalid input 422s before the handler runs.
- Modules self-register in `src/modules/index.ts` (one import + one
  `app.register` each) — a new module not added there is dead code.
- Adapters (llm/github/git/astgrep/secrets) sit behind `platform/container.ts`
  DI; tests swap in `src/adapters/mocks.ts` — don't mock at the module level.
- Secrets are **not** part of `AppConfig` — they go through `SecretsProvider`
  (`~/.devdigest/secrets.json`, mode `0600`); `GITHUB_TOKEN` is canonical,
  `GITHUB_PAT` is accepted as a fallback.
- `REPO_INTEL_ENABLED` defaults to `true` — repo-map/blast-radius context is on
  unless explicitly disabled per-env or per-agent.

## Do-not-touch

- `src/vendor/shared` — an independent copy from `client/src/vendor/shared`,
  not auto-synced; `reviewer-core`'s path alias points here directly, so a
  change here reaches reviewer-core immediately but needs manual porting to
  client's copy.
- Applied migrations — never hand-edit one that already ran against a real DB;
  add a new one instead.

## Gotchas

- Migrations do **not** run on boot — `pnpm db:migrate` after any schema
  change, or routes fail with `relation ... does not exist`.
- The grounding gate (`reviewer-core`) drops any finding that doesn't cite a
  real diff line — if findings seem to vanish, check `groundFindings`, not
  the prompt.
- Prompt-injection defense is one shared `INJECTION_GUARD`
  (`reviewer-core/prompt.ts`), not keyword scanning — don't add ad-hoc
  denylist logic here.
- An unindexed repo silently degrades to diff-only context — no error, just a
  missing repo-map section in the prompt.

## Testing

`*.it.test.ts` = DB-backed (testcontainers Postgres, self-skips without
Docker); everything else is hermetic. `pnpm test` runs both.

## Read when

- Testing/CI questions: [../TESTING.md](../TESTING.md).
- Writing/editing an agent's system prompt: [../docs/agent-prompts](../docs/agent-prompts/).
- `../specs/` — not created yet.

Finishing a substantive task here (bug fix, non-trivial change, discovery)?
Append an entry to [LEARNINGS.md](LEARNINGS.md) — don't skip it.
