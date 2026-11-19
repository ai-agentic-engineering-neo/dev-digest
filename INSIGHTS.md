# dev-digest (cross-cutting) — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — Creating several new files in one Bash call (`mkdir -p` + multiple `cat > … <<EOF`) got rejected by Claude Code's removal safety check → use the Write tool per new file; Python heredoc string-replace edits of existing files pass fine (evidence: client/src/components/run-cost-badge/*)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-19 — `EADDRINUSE` on :3000/:3001 or port still busy after stopping a dev server → an earlier `./scripts/dev.sh` run leaves orphaned `next-server` / `tsx watch src/server.ts` processes; find them with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, kill the `tsx watch` parent (not only the child), then restart (evidence: scripts/dev.sh#cleanup)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
