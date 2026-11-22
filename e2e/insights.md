# E2E insights

Non-obvious findings from working on `@devdigest/e2e`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

### scripts/e2e.sh does not install e2e/ deps
**Date:** 2026-11-22
**Evidence:** `scripts/e2e.sh`

On a fresh checkout the hermetic runner brings the whole stack up, then fails at the very end with `sh: tsx: command not found` and tears it down. Run `cd e2e && npm install` once (plus `npm i -g agent-browser && agent-browser install`) before `./scripts/e2e.sh`.

## Codebase Patterns

## Tool & Library Notes

### `wait --text` matches rendered text, after CSS text-transform
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/styles.ts` (header uppercase)

Text styled `textTransform: uppercase` (popover/section headers) is matched as rendered: `wait --text "21 findings"` timed out while the header showed "21 FINDINGS". Use the uppercase form for such labels (inferred from one run — confirm if it bites again).

## Recurring Errors & Fixes

## Session Notes

## Open Questions
