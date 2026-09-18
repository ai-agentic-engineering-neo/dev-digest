# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: current state works end to end;
each course lesson adds one feature back (see `README.md`).

## Before answering

Search FIRST — curated, may already answer it — then read code:

- Root-level or cross-package question → root `docs/`, `specs/`, `INSIGHTS.md`.
- Package-specific question → that package's `docs/`, `specs/`, `INSIGHTS.md`.
- Unsure which, or it could be either → check both root and the package's.

## Monorepo structure

Not a real workspace (see Conventions) — four independent packages, each with
its own `package.json`/lockfile/toolchain:

- `client/` (`@devdigest/web`) — the studio: Next.js 15 UI. Import repos,
  browse PRs, run and read AI reviews, author agents.
- `server/` (`@devdigest/api`) — the engine: Fastify 5 + Postgres API. Imports
  repos/PRs, indexes a repo, runs the reviewer, persists everything.
- `reviewer-core/` (`@devdigest/reviewer-core`) — the review engine: a pure
  diff → prompt → LLM → grounded-findings library. No DB/GitHub/filesystem;
  consumed by `server` via a tsconfig path alias, not a build.
- `e2e/` (`@devdigest/e2e`) — deterministic browser end-to-end flows against
  the seeded demo data, via `agent-browser` (no Playwright, no LLM).

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own `package.json`/lockfile;
  cross-package code (`@devdigest/shared`, `@devdigest/ui`) is shared via
  tsconfig path aliases into `src/vendor/*`, not a published package.
- ESM everywhere: relative imports carry the `.js` extension even though the
  source is `.ts` (server, client, reviewer-core all do this).
- Modules are registered statically in `server/src/modules/index.ts` (no
  filesystem autoload).

## Do-not-touch

- `server/src/vendor/**`, `client/src/vendor/**` — meant to be synced copies
  of a source package, but no such source package or re-vendor tooling
  exists in this checkout: hand-edit both copies identically and `diff` them
  to confirm they still match.
- `server/src/db/migrations/`, `server/src/db/schema/*` — never hand-edit an
  applied migration; add new tables via a new domain file, don't restructure.
- `skills-lock.json` / `.claude/skills/` — hash-pinned vendored Claude Code
  dev-tooling skills, unrelated to the product's own future "Skills" feature.
- Per-package dependency lockfiles — never hand-edit, only regenerate via
  that package's own package manager: `client/pnpm-lock.yaml`,
  `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
  `e2e/package-lock.json`.

## Use when

- Stack, commands, architecture, how to run → read `README.md`
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`
  · `client/CLAUDE.md` · `reviewer-core/CLAUDE.md` · `e2e/CLAUDE.md`
- Root-level deep-dives / specs / running notes → `docs/` · `specs/` ·
  `INSIGHTS.md`
- Built-in agent prompt templates → `docs/agent-prompts/`
