# INSIGHTS — e2e

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

## Gotchas & Recurring Errors

**2026-09-16** — `agent-browser wait --text`/`find text` match the RENDERED (post-CSS) text, not the raw i18n string — a header row styled with `textTransform: "uppercase"` shows "FINDINGS" to the matcher even though the JSON catalog says `"Findings"`. `02-repo-pulls-detail.flow.json`'s Findings-header assertion used the JSON-case string and silently timed out every run until changed to `"FINDINGS"`. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:109` (`headRow.textTransform`), `e2e/specs/02-repo-pulls-detail.flow.json`.

**2026-09-16** — `wait --url` resolves as soon as the client-side route/URL changes, NOT once the page's data fetch has rendered — an immediately-following `find text ... click` can race the PR list's still-loading skeleton and fail. `04-pr-findings.flow.json` and `05-pr-diff.flow.json` both went straight from `wait --url /pulls` to `find text "Add rate limiting..." click` and failed consistently (not flaky — every hermetic run); `02-repo-pulls-detail.flow.json`'s equivalent click never had this problem because it already had an explicit `wait --text` for the PR title first. Fixed by inserting the same `wait --text` step before the click in both. Evidence: `e2e/specs/04-pr-findings.flow.json`, `e2e/specs/05-pr-diff.flow.json`.

## Open Questions

## Session Notes
