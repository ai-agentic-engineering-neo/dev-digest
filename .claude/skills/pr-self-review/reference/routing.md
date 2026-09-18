# Routing

`routing.json` in this directory is the machine source of truth — `collect-diff.sh`
reads it with `jq` and nothing else encodes the table. This file explains it.

**First match wins, top to bottom. A file lands in exactly one bucket.** The
hard rules run over the whole file list independently, so a `vendor/` file still
gets its CRITICAL even though it also sits in a bucket.

| Bucket | Catches | Skills the reviewer loads | Gates |
|---|---|---|---|
| `contracts` | `*/src/vendor/shared/contracts/**` | `zod`, `typescript-expert` | all three typechecks |
| `vendor` | the rest of `*/src/vendor/**` | — (hard rule only) | the owning typecheck |
| `db-migrations` | `server/src/db/migrations/**`, `drizzle.config.ts` | `drizzle-orm-patterns`, `postgresql-table-design` | `server:typecheck` |
| `db-schema` | the rest of `server/src/db/**` | + `onion-architecture` | + `server:arch`, unit tests |
| `backend` | `server/src/**`, `server/test/**` | `onion-architecture`, `fastify-best-practices`, `zod`, `security`, `typescript-expert` | `server:` typecheck, lint, arch, unit |
| `frontend` | `client/src/{app,components,lib,i18n,test}/**`, `client/messages/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `security`, `typescript-expert` | `client:` typecheck, lint, arch, test |
| `engine` | `reviewer-core/src/**` | `typescript-expert`, `zod`, `security` | `core:typecheck`, `core:test` |
| `workflow` | `e2e/**`, `.github/**`, `scripts/**`, `*.sh` | `security` | `sh:syntax`, `yaml:parse`, `e2e:typecheck` |
| `deps` | any `package.json` / lockfile | `security` | the owning typecheck |
| `meta` | `.claude/**`, `skills-lock.json` | — | — |
| `docs` | `**/*.md`, `docs/`, `specs/` | `engineering-insights`, `mermaid-diagram` | — |
| `config` | `*.cjs`, `*.mjs`, `tsconfig*.json`, `*.config.*` | `typescript-expert` | the owning typecheck |
| `unrouted` | anything else | `typescript-expert`, `security` | — |

## Conditional additions

A bucket picks up extra skills when its files warrant it, rather than loading
everything every time:

| When the bucket contains | It also loads |
|---|---|
| a `repository*` or `db/` file (backend) | `drizzle-orm-patterns` |
| a `*.test.tsx` (frontend) | `react-testing-library` |

`mermaid-diagram` is listed on `docs` but only earns its keep when a
` ```mermaid ` fence actually changed — say so if you skip it.

## Buckets merge into agents

Spawning one agent per bucket would mean eleven agents for a wide change. They
merge:

```
db-migrations + db-schema                  → database
workflow + config + meta + docs + deps + unrouted → workflow-docs
contracts                                  → always its own agent
vendor                                     → no agent at all
```

`contracts` never merges: two physical copies of the shared Zod schemas is the
most expensive mistake available in this repo, and it deserves undivided
attention. Cap is 5 agents.

## Package managers come free

Gates are written `pnpm --dir server` / `npm --prefix reviewer-core`, never
`cd`. Running `pnpm` where the lockfile is `package-lock.json` is structurally
impossible, so the rule in root `CLAUDE.md` cannot be forgotten.

## Extending it

Add a package, add a rule — and put it **above** the catch-all. Then:

1. Add the bucket to `buckets` with its skills and gates.
2. Decide its `agent`: a new one, or fold it into `workflow-docs`.
3. Add the gate command to `run-gates.sh` if it is new.
4. Run `/pr-self-review` and check `unrouted` is empty.

A path that keeps showing up in a report's *"Not covered by any routing rule"*
section is the signal that this file is behind the repo.
