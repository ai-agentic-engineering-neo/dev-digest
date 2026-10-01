# Skill routing

Single source of truth for which project skill applies to which change. Read by `planner` (to name skills per step), `implementer` (to load them per step) and the review, test and docs agents, so a plan never promises a skill the implementer will not apply. Update this file when skills are added or removed; the directory `.claude/skills/` is the truth, not `skills-lock.json` or `.claude/skills/README.md`.

## Routing table

| Touched path / change type | Skills |
|---|---|
| `server/**`, `reviewer-core/**`, `e2e/**` (any backend code) | `onion-architecture` |
| Fastify route, plugin, hook, schema, error handling | `fastify-best-practices` |
| Drizzle query, schema field, relation, transaction | `drizzle-orm-patterns` |
| Table, column, index, constraint design | `postgresql-table-design` |
| Zod schema, `safeParse`, `@devdigest/shared` contract | `zod` |
| `client/**` placement: new component, hook, constant, helper, folder | `frontend-ui-architecture` |
| `client/**` component internals, hooks, state, performance | `react-best-practices` |
| `client/src/app/**`, RSC boundaries, metadata, route handlers | `next-best-practices` |
| Client tests (`*.test.tsx`) | `react-testing-library` |
| Auth, user input, file handling, secrets, new endpoints | `security` |
| Non-trivial type-level work | `typescript-expert` |
| Start and end of any non-trivial task | `engineering-insights` (read only, unless the caller says to record) |
| Diagrams in docs | `mermaid-diagram` |

`planner` and `implementer` preload the same 12 skills via `skills:`, in this order: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `security`, `engineering-insights`. The table above decides which of them apply to a step. `mermaid-diagram` is not preloaded by them; load it through the `Skill` tool when needed (`doc-writer` preloads it).

**Skills per agent.** The four newer agents keep narrow lists (preloading puts full skill content into context):

| Agent | Preloaded skills |
|---|---|
| `test-writer` | `react-testing-library`, `fastify-best-practices`, `onion-architecture`, `zod`, `typescript-expert`, `engineering-insights` (read only). Other skills through `Skill` (`react-best-practices`, `next-best-practices`) when the table says so. |
| `architecture-reviewer` | `onion-architecture`, `frontend-ui-architecture`, `zod`, `engineering-insights` (read only) |
| `plan-verifier` | `engineering-insights` (read only) |
| `doc-writer` | `mermaid-diagram`, `engineering-insights` (read only) |

Changing one of these lists means changing this table in the same edit.

**Sync rule.** `planner` and `implementer` must use the same skills for frontend and backend alike. The `skills:` lists in `.claude/agents/planner.md` and `.claude/agents/implementer.md` must stay identical, and any skill added to or removed from them changes this table and the list above in the same edit. Neither agent keeps a private skill list.

## Not routed

- `pr-self-review` is manual-only (`disable-model-invocation: true`). It runs after the implementer, outside both agents.
- `code-review`, `security-review`, `simplify`: review roles, not implementation. Architecture review is done by `architecture-reviewer`; checking work against a plan by `plan-verifier`. Security review has no agent.

## Commands per package

| Package | Manager | Typecheck | Test |
|---|---|---|---|
| `server` | pnpm | `pnpm typecheck` | `pnpm test`. Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`. Integration only: `pnpm exec vitest run .it.test` (needs Docker; `*.it.test.ts` self-skip without it). |
| `client` | pnpm | `pnpm typecheck` | `pnpm test`; `pnpm build` catches webpack-only import errors |
| `reviewer-core` | npm | `npm run typecheck` | `npm test` |
| `e2e` | npm | `npm run typecheck` | `npm run e2e:hermetic` (needs the full stack and agent-browser; do not run casually) |

`pnpm lint` / `pnpm arch` in `server` may not exist on every branch. Check `package.json` before relying on them.

`scripts/check-all.sh [--build] [--force]` runs typecheck + hermetic tests for `server`, `reviewer-core` and `client` once per working-tree state and caches the result in `.claude/cache/` (gitignored), keyed by a hash of HEAD + tracked diff + untracked files. It never runs `*.it.test.ts`, `e2e` or lint. `scripts/review-input.sh <out-dir>` writes `review.patch`, `manifest.txt` and `tree-hash.txt` once for reviewer agents to read by path.

## Known traps a plan must account for

- Contracts change in `@devdigest/shared` (`server/src/vendor/shared`) first. `client/src/vendor/shared` is a hand copy with no sync script, so contract changes need an explicit sync step.
- Importing a value (not a type) from `@devdigest/shared` in client code can break `next build`.
- Migrations: never invented or rewritten. Before trusting `pnpm db:generate`, check the real schema with `psql \d`; the local DB may be drifted. `db:generate` can block on an interactive rename prompt.
- A skill reaches a prompt only when both `skills.enabled` and `agent_skills.enabled` are on.
- `server/src/platform/{prompt,grounding,structured}.ts` are re-exports of `reviewer-core`. Do not edit them to change behavior.
- A `tools` allowlist does not make an agent read-only if it has Bash; `.claude/hooks/agent-guard.sh` guards the hooked agents, and `architecture-reviewer` simply has no Bash.
- Never touch `server/clones/**`, `**/src/vendor/**` (except a deliberate `vendor/shared` contract change), migrations, lockfiles.
