# server — insights

Durable findings for `@devdigest/api`: things that are true about this code but not
visible in it. Recorded by agents at the end of a non-trivial task, per
[`CLAUDE.md`](CLAUDE.md) → *After finishing*.

Append-only; correct a stale entry with a dated note beneath it. Every entry cites
evidence. Fixed sections — never invent a heading. Cross-package findings live in
[`../insights.md`](../insights.md) instead.

## Gotchas & fixes

## Codebase patterns

- **2026-09-18** — `TESTING.md` and two workflows describe `server/package.json` as
  marked `skip-worktree`, which is given as the reason CI inlines the vitest commands
  instead of calling `test:unit`/`test:integration` scripts. `git ls-files -v` shows
  **no** skip-worktree entries in this checkout today — the doc claim is stale, but
  the inlined CI commands remain the actual source of truth either way. Evidence:
  `git ls-files -v | grep '^S'` → empty; `.github/workflows/server-unit.yml`.

## Rejected approaches

## Open questions
