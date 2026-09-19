# DevDigest

Local-first AI pull-request review: diff → prompt → LLM → grounded findings.
**Course starter template.** `main` is deliberately trimmed; lessons L01–L08 add
features back. Homework lives in forks — never commit it to `main`.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript 5.7 (`strict`, `noUncheckedIndexedAccess`)
Fastify 5 · Drizzle 0.38 · Postgres 16 + pgvector · Next.js 15 · React 19 · Zod 3 · Vitest 2

## Modules — four standalone packages, NOT a pnpm workspace

| Path | Package | Port |
|---|---|---|
| `server/` | `@devdigest/api` | 3001 |
| `client/` | `@devdigest/web` | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | — |
| `e2e/` | `@devdigest/e2e` | — |

Packages are linked ONLY through tsconfig path aliases pointing at a sibling's
*source*. Nothing is published; `reviewer-core` never emits JS (`build` = `tsc --noEmit`).

## Read when

- **Working inside any module** → read that module's `CLAUDE.md` first
  (`server/`, `client/`, `reviewer-core/`, `e2e/`). Module conventions live there
  and are never duplicated here.
- **Following the review pipeline end to end** → read `docs/architecture.md`.
- **Adding or changing an API route** → read `server/README.md` for route contracts.
- **Writing or fixing tests** → read `TESTING.md`.
- **Starting a lesson task** → read `specs/lessons/<Lxx>.md`.
- **Hitting behaviour that looks like a known trap** → read the nearest
  `INSIGHTS.md` (module-level first, then this directory).

## Insights loop

**Session Context.** Before working in a module, read its `INSIGHTS.md`
(module-level first, then this directory) and say in one line what you read.
Treat it as high-confidence guidance unless told otherwise.

**End of Session.** Run the `engineering-insights` skill to record what was
learned. Do not skip this step. If nothing non-obvious happened, say so and
stop — recording noise is worse than recording nothing.

## Commands

```sh
./scripts/dev.sh              # Postgres + migrations + seed + both servers
docker compose up -d          # Postgres only
cd server && pnpm db:migrate  # REQUIRED manually — never runs on boot
cd server && pnpm db:seed     # idempotent; without it the API fails "No system user"
pnpm test / pnpm typecheck    # per package
pnpm lint                     # eslint — server/ and client/
pnpm arch                     # import boundaries (dependency-cruiser) — server/ and client/
/pr-self-review               # pre-PR gate — run before gh pr create
./scripts/e2e.sh              # browser flows
```

Server tests split by filename: `*.it.test.ts` need Docker, everything else is hermetic.

## Before opening a PR

Run `/pr-self-review`. It routes every open change — committed, staged, unstaged
and untracked — to the skills that own those files, runs only the gates those
files need, and writes `.claude/pr-self-review/report.md`.

One or more CRITICAL findings is a hard stop: a `PreToolUse` hook in
`.claude/settings.json` denies `gh pr create` / `gh pr merge` / `git push` until
a fresh passing report exists. Fresh means the recorded `HEAD` and diff hash
still match, so any edit invalidates it. **A blocked command means
`.claude/pr-self-review/report.md` has CRITICAL findings — read it.**

Deliberate override: append `# psr-skip` to the command. It is recorded in
`overrides.log` and printed in the generated PR body, so it is never silent.

The hook only sees commands this session runs. A PR opened from your own
terminal is not gated.

## Naming

- Non-component TS and its directories are kebab-case: `diff-loader.ts`,
  `model-router.ts`, `reviewer-core/src/output/to-review.ts`, `repo-intel/`.
- React components are PascalCase, the file named exactly after the component:
  `SeverityCounts.tsx`, `AgentCard.tsx`, `vendor/ui/kit/TextInput.tsx`.
- A `_` prefix means private to its parent — `db/schema/_shared.ts`,
  `modules/_shared/`, `app/**/_components/`. Never import one from outside it.
- Tests sit next to their subject as `<subject>.test.ts(x)`
  (`severity-counts/helpers.test.ts`); server DB-backed tests add `.it.test.ts`.
- DB names are snake_case in SQL, camelCase in the Drizzle key:
  `workspaceId: uuid('workspace_id')`. Generated migration filenames stay as-is.
- i18n lives in `client/messages/<locale>/<namespace>.json` — camelCase namespace
  file (`prReview.json`, `agentPerformance.json`) and camelCase keys.
- Branches are `L0x-lab` / `L0x-homework`; commits are Conventional Commits
  (`feat(reviews): …`, `docs: …`).

## Gotchas

- Migrations never run on boot. `relation ... does not exist` → `pnpm db:migrate`.
- `@devdigest/shared` exists in TWO physical copies — `server/src/vendor/shared/`
  and `client/src/vendor/shared/` — and they have already drifted. Change a
  contract → change both in the same commit. `reviewer-core` reads the server copy.
- The DB schema holds tables for EVERY lesson (skills, eval, ci, memory, …).
  Empty does not mean dead.
- zod can be loaded twice — never rely on `instanceof z.ZodError` alone.
- No auth: `LocalNoAuthProvider` always returns workspace `default`. Every table
  still carries `workspace_id` — always scope through `getContext()`.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), not in the DB.
  `LocalSecretsProvider` is the only read chokepoint.
- `server/` and `client/` use pnpm; `e2e/` and `reviewer-core/` use npm.

## Do not touch

- `*/src/vendor/**` — vendored code. Edit only on an explicit request.
- `server/src/db/migrations/**` — never edit applied migrations; use `pnpm db:generate`.
- `*/pnpm-lock.yaml`, `*/package-lock.json`, `skills-lock.json` — never hand-edit a
  lockfile. Change a dependency with that directory's own package manager (pnpm in
  `server/` and `client/`, npm in `e2e/` and `reviewer-core/`) and commit whatever it
  rewrites. `skills-lock.json` stores content hashes — an edit breaks verification.
- There is no root `package.json` and no root lockfile — this is NOT a workspace.
  Never create one, and never run `pnpm` where the lockfile is `package-lock.json`.
- `T1`/`T2`/`T3` and `acceptance #N` comments are development-plan artifacts, not TODOs.
