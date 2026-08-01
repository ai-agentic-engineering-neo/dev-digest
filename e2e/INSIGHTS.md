# e2e — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-07-29** — All flows run against one shared browser session rather than a fresh context each, so a flow inherits whatever page, cookies, and local storage the previous flow left behind — flows are order-dependent and a failure can be caused by the spec before it. Evidence: `e2e/run.ts:6`.

## Tool & Library Notes

- **2026-07-29** — A failure screenshot is best-effort (`.catch(() => {})`), so an empty `test-results/` after a red run means the screenshot step failed, not that the flow passed. Evidence: `e2e/run.ts:86`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
