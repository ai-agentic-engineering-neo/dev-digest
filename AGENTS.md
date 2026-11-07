# DevDigest — root map

Local-first AI pull-request review (course starter: import PR → agent review → grounded findings).
Each lesson L01–L08 adds one feature; unused DB tables / i18n files for future lessons are expected.

## Session protocol (MANDATORY)

1. **Start — after the user's first prompt, before any other work:** decide which package(s) the task
   is about (table below; `repo-intel` → `server/`) and READ `<pkg>/INSIGHTS.md` for each of them in
   full. Treat entries as high-confidence guidance unless the user says otherwise. In your first reply
   name the 1–3 entries relevant to the task (or say "no relevant insights").
   Then search that package's `docs/` and `specs/` — they may already answer the question — then code.
2. **During work:** something non-obvious confirmed → run the `engineering-insights` skill right away.
3. **End of every task:** run the `engineering-insights` skill (wrap-up). It re-reads `INSIGHTS.md` and
   writes ONLY new, substantive insights; if nothing new happened, it leaves the file untouched.

## Packages (NOT a monorepo workspace)

| Folder | What | Pkg manager | Module rules |
|---|---|---|---|
| `server/` | Fastify 5 API + Drizzle/Postgres 16 (pgvector), `:3001`; contains `repo-intel` | pnpm | `server/CLAUDE.md` |
| `client/` | Next.js 15 / React 19 studio, `:3000` | pnpm | `client/CLAUDE.md` |
| `reviewer-core/` | Pure review engine: diff → prompt → LLM → grounded findings | **npm** | `reviewer-core/CLAUDE.md` |
| `e2e/` | Deterministic browser flows (agent-browser, no LLM) | npm | `e2e/CLAUDE.md` |
| `mcp-server/` | stdio MCP server (5 tools) over the DevDigest HTTP API — no DB access; wired in `.mcp.json` | npm | `mcp-server/CLAUDE.md` |

Cross-package code is shared via **tsconfig path aliases to raw `.ts` source**, not published packages:
`@devdigest/reviewer-core` → `../reviewer-core/src`, `@devdigest/shared` → `<pkg>/src/vendor/shared`.

## Commands

- Whole stack from zero: `./scripts/dev.sh` (flags: `--no-seed`, `--no-client`, `--db-only`)
- Tests: run inside the package — see that package's `CLAUDE.md`. Node ≥ 22, pnpm ≥ 10, Docker.

## Cross-package rules

- ESM: relative imports carry the `.js` extension (server, reviewer-core). Exceptions: `client/`
  (Next bundler, no extension) and `server/src/db/schema/` (no extension, loaded by drizzle-kit).
- Zod contracts live in **two copies**: `server/src/vendor/shared` (canonical; reviewer-core uses it) and
  `client/src/vendor/shared`; they have already drifted. Do not edit either — see Do not touch.
- `reviewer-core` change → also run `server` unit tests (server type-checks against its source).
- Comments mentioning task codes (`T1.3`, `T3`, `F1`, `A2`), "intent", "agent-runner" refer to the full
  product; the feature may not exist in the starter. Trust code over comments.

## Naming conventions (cross-package)

Package-specific rules: `<pkg>/CLAUDE.md` § Naming conventions.

- Non-component files/folders are kebab-case: `run-executor.ts`, `to-review.ts`, `modules/repo-intel/`, `github-urls.ts`.
  PascalCase files/folders only for React components in `client/`.
- camelCase functions/vars, PascalCase types/classes, SCREAMING_SNAKE module constants
  (`REVIEW_STRATEGY`, `DEFAULT_MAP_THRESHOLD_LINES`, `SEV_COLOR_FALLBACK`).
- Three casings for one field: Postgres `snake_case` (`start_line`) → Drizzle/TS `camelCase` (`startLine`) →
  Zod contract / API JSON `snake_case` (`start_line`, `run_id`, `cost_usd`). Convert in DTO mappers, not in UI.
- Zod contracts: `export const Finding = z.object(…)` + `export type Finding = z.infer<typeof Finding>` (same name).
- Tests `*.test.ts(x)`; server DB-backed tests only `*.it.test.ts`; e2e flows `e2e/specs/NN-kebab.flow.json`.
- Specs `<pkg>/specs/<feature-kebab>.md` (same filename in each package a feature spans, e.g. `run-cost-badge.md`);
  docs `<pkg>/docs/<topic-kebab>.md`.

## Do not touch

- `server/src/vendor/shared/` and `server/src/db/migrations/` — never hand-edit without coordination
  (stop and ask the user first; migrations are generated with `pnpm db:generate`).
- `server/clones/**` — runtime git checkouts (contain the GitHub token in `.git/config`).
- `.claude/skills/**` + `skills-lock.json` — vendored third-party skills, pinned by hash.
  Exceptions: `.claude/skills/engineering-insights/`, `.claude/skills/frontend-ui-architecture/`, `.claude/skills/onion-architecture/`,
  `.claude/skills/pr-self-review/`, `.claude/skills/implement-plan/` and `.claude/skills/implementer-protocol/` are our own
  skills and may be edited (a new own skill must also be added to `ownSkills` in `pr-self-review/references/routing.json`).
- `.claude/pr-self-review/waivers.json` — only the user adds waivers; never write it to get a PASS.
- `*/pnpm-lock.yaml`, `*/package-lock.json` — only via the package manager.
- `server/package.json` is `skip-worktree` locally; don't rely on its scripts in CI changes.
- Never `docker compose down -v` — it wipes the dev DB volume with all imported repos.

## Read when

- Need the big picture / review flow → read `README.md` (Architecture section).
- Writing or running tests, touching CI → read `TESTING.md` and `.github/workflows/<suite>.yml`.
- Editing an agent's system prompt → read `docs/agent-prompts/README.md`.
- Unsure which skill applies → read `.claude/skills/README.md`.
- Feature spanning 2+ packages or 3+ tasks → `planner` agent writes `plans/<feature>.md`; after the user approves it,
  the user runs `/implement-plan plans/<feature>.md` (manual). Agents and the workflow: `.claude/agents/README.md`.
- Before `git push` / opening or merging a PR → ask the user to run `/pr-self-review` (manual only — auto-invoke
  is disabled; the gate hook blocks push/PR/merge without a fresh PASS).

## Knowledge files (per package)

- `<pkg>/README.md` — canonical description (source of truth; link, don't copy into CLAUDE.md).
- `<pkg>/docs/` — deeper design docs, one topic per file, indexed in `<pkg>/docs/README.md`.
- `<pkg>/INSIGHTS.md` — non-obvious lessons, in 7 fixed sections. Read at session start; written only
  via the `engineering-insights` skill (append-only, no duplicates) — never put them here.
