# DevDigest — repo map

Local-first AI PR review. 4 standalone packages, no workspace — cross-package
contracts are shared by vendoring `vendor/shared` into each package that needs
it (not published, not npm-linked).

## Stack

Node ≥22 · pnpm ≥10 · Fastify · Next.js 15 · Drizzle/Postgres (pgvector) ·
Docker (Postgres only — API and web run on the host).

## Where things live

| Package | Role | Read when |
|---|---|---|
| [server/](server/) | Fastify API + DB + LLM adapters + repo-intel | touching API routes, DB schema, LLM adapters, repo-intel |
| [client/](client/) | Next.js studio UI | touching pages, components, hooks |
| [reviewer-core/](reviewer-core/) | diff → prompt → LLM → findings engine | touching review logic, grounding, prompt assembly |
| [e2e/](e2e/) | deterministic browser e2e (agent-browser) | writing/debugging e2e flows |

## Read when

- Changing how packages talk to each other, or the end-to-end review flow:
  read [README.md](README.md#architecture) (mermaid diagram lives there — do
  not duplicate it here).
- Working inside one package: read `<package>/CLAUDE.md` first — it points to
  that package's own README, `docs/`, `specs/`, and `INSIGHTS.md`.
- Cross-package findings from earlier sessions: read [INSIGHTS.md](INSIGHTS.md).
- Agent system prompts (reviewer personas): read
  [docs/agent-prompts/README.md](docs/agent-prompts/README.md).
- Test strategy across packages: read [TESTING.md](TESTING.md).

## Non-default conventions

- No monorepo workspace. `server/src/vendor/shared` and
  `client/src/vendor/shared` are the same contracts package, vendored into
  both — see each package's CLAUDE.md before editing either copy.
- `server/` does not run DB migrations on boot — always `pnpm db:migrate`
  manually after pulling schema changes.

## Do-not-touch

- `*/vendor/shared/**`, `client/src/vendor/ui/**` — vendored, not authored in
  place. Edit at the sync source (see the owning package's CLAUDE.md).

## Commands

Per-package only — see [README.md](README.md#useful-scripts). Don't
duplicate them here.


## GIT 

Always use the branch name as a commit prefix, unless it is `main`.