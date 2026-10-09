# e2e — insights

Append-only log of **non-obvious** things learned while working here — what you couldn't
guess from the code. Entries are added by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill (or by hand in
the same format).

- **Add, never rewrite.** Existing lines are never edited, reordered or deleted. A correction is
  a new dated entry whose Insight starts with `Supersedes: "<old title>"`.
- **No duplicates.** Check this file and [AGENTS.md](AGENTS.md) first; titles are unique.
- New entries go at the **end** of their section. A human may promote a stable insight to
  `AGENTS.md` → Gotchas.

Entry format:

```md
### YYYY-MM-DD — short specific title
**Context:** what you were doing · **Insight:** what turned out to be true ·
**Evidence:** `path/to/file.ts:42` · **Apply when:** trigger for reusing it
```

---

## What Works

_Approaches and solutions that worked and are worth repeating._

## What Doesn't Work

_Dead ends and anti-patterns — what was tried and why it failed. The most skipped section, and the most valuable._

## Codebase Patterns

_Conventions and architectural decisions (with the reason) that the code doesn't explain._

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

### 2026-10-07 — local dev DB usually breaks flow 02; use the hermetic run
**Context:** running flows against a dev stack where you've added your own repos. · **Insight:**
the home redirect lands on the *first* repo, which won't be `acme/payments-api`. `npm run
e2e:hermetic` starts an empty Postgres on alternate ports, so the seed is the only repo. ·
**Apply when:** flow 02 fails locally but passes in CI.

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
