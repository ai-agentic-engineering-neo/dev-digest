# Insights

Lessons learned in this package: traps, non-obvious behaviour, approaches that
failed and why. Read before changing non-trivial code here. Maintained by the
`engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`).
Append-only: newest at the bottom of each section. Corrections go in as
`> **Superseded YYYY-MM-DD:** …`, never as deletions.

Entry format (Session Notes and Open Questions are `- YYYY-MM-DD — …` one-liners):

```
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious
**Rule:** ALWAYS/NEVER <action> — because <reason>
**Evidence:** path/to/file.ts → symbolName() | test name | command
```

Only add an entry if it is non-obvious from reading the code, specific, and
actionable cold.

---

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-11-22 — [REVIEW NEEDED] e2e:hermetic fails "Bind for 127.0.0.1:5433 failed: port is already allocated"
**Insight:** The hermetic stack defaults its ephemeral Postgres to :5433, but a dev `devdigest-postgres` container may itself be mapped to 127.0.0.1:5433 (when :5432 is taken by another project), so `docker run` exits 125 before any flow runs.
**Rule:** ALWAYS check `docker ps` for a :5433 mapping and run `E2E_PG_PORT=5434 npm run e2e:hermetic` when it is taken — because the dev DB must not be stopped to free the port.
**Evidence:** `scripts/e2e.sh` → `PG_PORT="${E2E_PG_PORT:-5433}"`; `docker ps` → `devdigest-postgres 127.0.0.1:5433->5432`
> **Update 2026-11-25:** confirmed again; the fix also works with all three ports moved: `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh` → 7/7 flows passed.

## Session Notes

- 2026-11-22 — e2e hermetic run after M1 severity counters: 7/7 flows passed on E2E_PG_PORT=5434; see "e2e:hermetic fails"

## Open Questions
