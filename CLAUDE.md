# DevDigest

Local-first AI PR-review tool; this repo is the **course starter template**. Five
independent packages, **no monorepo workspace** — each has its own `package.json` and
lockfile; cross-package sharing is via tsconfig path aliases, not published modules.
Each package has its own `CLAUDE.md` for internals — this file only covers what's true
repo-wide.

## Map

| Folder | Package | What it is | Port |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify API + Drizzle/Postgres (pgvector) | 3001 |
| `client/` | `@devdigest/web` | Next.js 15 web app | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → findings | — |
| `e2e/` | `@devdigest/e2e` | Deterministic browser e2e (agent-browser) | — |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts, hand-copied into `client/src/vendor/shared` too | — |

`repo-intel` (codebase indexer) lives inside the server at
`server/src/modules/repo-intel`. `docs/agent-prompts/*.md` documents the seeded
reviewer-agent system prompts — read there before changing agent prompt or output-schema
behavior.

## TypeScript conventions (all 3 TS packages)

No linter/formatter is configured anywhere in this repo — don't invent generic style
rules, mirror the surrounding file. These two are structural, not stylistic, and are
identical in every `tsconfig.json`:

- `strict: true` + `noUncheckedIndexedAccess: true` — array/object index access is
  `T | undefined`, not `T`.
- ESM + `moduleResolution: NodeNext`: relative imports need an explicit `.js` extension
  on `.ts` source, e.g. `import { x } from './helpers.js'`.

## Repo-wide gotchas

- Only Postgres runs in Docker (`docker-compose.yml`); API and web run on the host via
  `pnpm dev`.
- The server does **not** run DB migrations on boot — `cd server && pnpm db:migrate` is
  a manual step after pulling any change that adds one.
- Full CI/test-split strategy is in `TESTING.md` — don't re-derive it here.

## Learnings

`LEARNINGS.md` (and one per package) is the append-only draft knowledge base the
`learnings` skill writes to and promotes proven entries from into these `CLAUDE.md`
files — skim it before non-trivial repo-wide work, but treat it as lower-confidence
than this file until an entry has actually been promoted.
