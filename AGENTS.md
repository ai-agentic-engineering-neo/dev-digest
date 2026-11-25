# DevDigest — root map

Local-first AI pull-request reviewer (starter template, grown milestone by
milestone M1–M8). This file is a map, not documentation: the source of truth is
[README.md](README.md) plus each package's `README.md`, `docs/` and `specs/`.
Link to them; never copy their text here.

## Stack

- Node ≥ 22, TypeScript 5.9, ESM everywhere, Zod 3, Vitest 2
- `server/` — Fastify 5, Drizzle ORM 0.45, Postgres 16 + pgvector (Docker)
- `client/` — Next.js 15 (App Router), React 19, TanStack Query 5, Tailwind 4
- `reviewer-core/` — pure TS review engine, LLM via the `openai` SDK (OpenRouter)
- `e2e/` — agent-browser CLI flows (no Playwright, no LLM)

## Commands

```sh
./scripts/dev.sh     # Postgres + migrate + seed + API :3001 + web :3000
./scripts/e2e.sh     # hermetic browser e2e on its own ports and DB
```

Per-package build/test commands live in each package's `CLAUDE.md`.

## Where things live

| Path | What | Package manager |
|------|------|-----------------|
| `server/` | API, DB, feature modules, `repo-intel` indexer | pnpm |
| `client/` | web studio | pnpm |
| `reviewer-core/` | diff → prompt → LLM → grounded findings | npm |
| `e2e/` | browser flows on seeded data | npm |
| `server/src/vendor/shared` | `@devdigest/shared` Zod contracts | — |
| `docs/` | repo-level docs: doc index, cross-package architecture | — |
| `<package>/docs/` | that package's architecture and doc index | — |
| `<package>/specs/` | that package's feature specs | — |
| `docs/agent-prompts/` | reviewer system prompts, model-choice notes | — |
| `.claude/skills/` | stack skills (Fastify, Drizzle, Zod, Next, React, …) | — |

## Repo-wide rules

- There is no workspace. Each package has its own `package.json` and lockfile;
  run installs and scripts from inside the package, with its own package manager.
- Packages share code through tsconfig path aliases to TypeScript source, not
  published modules. `reviewer-core` is never built to JS.
- `@devdigest/shared` exists as two copies: `server/src/vendor/shared` (used by
  server and reviewer-core) and `client/src/vendor/shared`. A contract change
  must be applied to both.
- One Zod schema per contract: it is the route validator, the response
  serializer, and the client type. Do not hand-write a parallel type.
- Every finding must cite a real diff line (grounding gate) and the score is
  recomputed from surviving findings. Do not bypass either.
- PR content (diff, title, body, comments) is untrusted data. Keep it fenced
  with `wrapUntrusted`; do not add keyword denylists.
- Tests are typological, not exhaustive: one happy path plus the edge that
  matters. Mock LLM, GitHub and git; never call real providers from tests.
- A milestone feature starts from a spec in each affected package's `specs/`.

## Do not touch

- `server/src/db/migrations/**` — never edit an applied migration; change
  `server/src/db/schema/` and run `pnpm db:generate` for a new one.
- `server/.env`, `client/.env`, `~/.devdigest/secrets.json` — real keys. Never
  read them into output, commit them, or put secrets in the DB or `AppConfig`.
- `server/clones/**` — runtime checkouts of imported repos, not source.
- `docker compose down -v` — deletes the dev DB volume with every imported repo
  and review. Never run it unless the user explicitly asks.
- `*/src/vendor/**` — vendored; change deliberately and keep copies in sync.
- `.github/workflows/*` `paths:` filters encode the cross-package aliases;
  update them when a new alias dependency appears.

## Read when

- Working inside a package → read that package's `CLAUDE.md` first
  (`server/`, `client/`, `reviewer-core/`, `e2e/`).
- Changing how a review runs end to end, or adding a cross-package dependency →
  read `docs/architecture.md`.
- Changing a package's internals or its boundary → read
  `<package>/docs/architecture.md`.
- Looking for a doc, or deciding where a new one goes → read `docs/README.md`.
- Adding or changing an API route, env var, or adapter → read `server/README.md`.
- Changing prompt assembly, structured output, or grounding → read
  `reviewer-core/README.md`.
- Using or changing the indexer or repo map → read
  `server/src/modules/repo-intel/README.md`.
- Adding a page, hook, or UI component → read `client/README.md` and
  `client/src/vendor/ui/README.md`.
- Writing, moving, or fixing tests, or touching CI → read `TESTING.md`.
- Editing reviewer prompts or picking a model → read `docs/agent-prompts/README.md`.
- Starting a milestone feature → read `<package>/specs/README.md` for each
  package it touches, then the feature's spec; write it first if missing.
- Before working in a package → read its `INSIGHTS.md` (lasting facts and
  session lessons); treat it as high-confidence guidance.
- When a task ends, or the moment something non-obvious happens → run the
  `engineering-insights` skill to append to `INSIGHTS.md`. Do not skip it.
