# e2e — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — Using `wait --text` / `wait --url` as the assertion needs no test framework: the command exits non-zero when the condition never holds, so a timeout and a failed assertion are the same failure with the same message. Evidence: `e2e/run.ts:72-76`.

## What Doesn't Work

- **2026-09-16** — agent-browser `scroll` and `screenshot --full` only ever capture the top of the app because the window itself never scrolls — the shell scrolls in an inner `<main style={{ overflow: "auto" }}>`; enlarge the viewport instead of scrolling. Evidence: `client/src/vendor/ui/shell/AppFrame.tsx:29`.

## Codebase Patterns

- **2026-09-16** — All flows run against one shared browser session rather than a fresh context each, so a flow inherits whatever page, cookies, and storage the previous flow left behind — flows are order-dependent and a red flow can be caused by the spec before it. Evidence: `e2e/run.ts:103-111`.

## Tool & Library Notes

- **2026-09-16** — The failure screenshot is best-effort (`.catch(() => {})`), so an empty `test-results/` after a red run means the screenshot step failed, not that the flow passed. Evidence: `e2e/run.ts:84-86`.

- **2026-09-16** — Each step is bounded by `E2E_STEP_TIMEOUT` (default 60 s) and 32 MB of stdout; exceeding either surfaces as an exec error on the step rather than as an assertion message, which reads like a browser failure but is not one. Evidence: `e2e/run.ts:45-49`.

- **2026-09-17** — Invoking the `agent-browser` binary directly from a shell (outside `run.ts`'s own flow loop) can take several minutes to return on its FIRST command on a cold machine, since that call has to launch a persistent daemon + Chrome behind the scenes; every later command against that same daemon responds in under a second. `E2E_STEP_TIMEOUT`'s 60s default (`e2e/run.ts:41`) is tuned for those later, warm calls — a manual first invocation hitting it looks like a hang, not slowness. Evidence: `e2e/run.ts:40-41`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
