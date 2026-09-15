# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: current state works end to end;
each course lesson adds one feature back (see `README.md`).

## Before answering

Search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what's
asked FIRST — curated, may already answer it — then read code.

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own `package.json`/lockfile;
  cross-package code (`@devdigest/shared`, `@devdigest/ui`) is shared via
  tsconfig path aliases into `src/vendor/*`, not a published package.
- ESM everywhere: relative imports carry the `.js` extension even though the
  source is `.ts` (server, client, reviewer-core all do this).
- Modules are registered statically in `server/src/modules/index.ts` (no
  filesystem autoload).

## Do-not-touch

- `server/src/vendor/**`, `client/src/vendor/**` — synced copies; edit the
  source package and re-vendor.
- `server/src/db/migrations/`, `server/src/db/schema/*` — never hand-edit an
  applied migration; add new tables via a new domain file, don't restructure.
- `skills-lock.json` / `.claude/skills/` — hash-pinned vendored Claude Code
  dev-tooling skills, unrelated to the product's own future "Skills" feature.

## Use when

- Stack, commands, architecture, how to run → read `README.md`
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`
  · `client/CLAUDE.md` · `reviewer-core/CLAUDE.md` · `e2e/CLAUDE.md`
- Root-level deep-dives / specs / running notes → `docs/` · `specs/` ·
  `INSIGHTS.md`
- Built-in agent prompt templates → `docs/agent-prompts/`
