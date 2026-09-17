# e2e/ — INSIGHTS

Non-obvious knowledge you can't infer from the code or git history: gotchas hit
in practice, "why it's built this way", debugging dead ends.

Contract:

- Append only — never rewrite, reword, or prune existing entries.
- One dated bullet per insight, newest on top of its section:
  `- YYYY-MM-DD — one actionable sentence. (<file>:<line> or dir/PR ref)`
- If it belongs in the README, `docs/`, or a flow spec instead — put it there.

## What Works

<!-- newest on top -->

- _none yet_

## What Doesn't Work

<!-- newest on top -->

- _none yet_

## Codebase Patterns

<!-- newest on top -->

- _none yet_

## Tool & Library Notes

<!-- newest on top -->

- 2026-09-17 — agent-browser 0.27 `wait --text` matches the CSS-text-transformed accessible text case-sensitively — header/pill assertions must use the UPPERCASE form ("FINDINGS", "FINDINGS IN THIS RUN", "CRITICAL"), never the DOM-cased source string. (specs/04-pr-findings.flow.json:16, specs/08-pr-list-findings.flow.json:9)
- 2026-09-17 — `find role <role> … --name` concatenates an element's child spans WITHOUT spaces — the severity pill's accessible name is "Critical1"/"Warning1", and substring names ("Critical", "Critical 1") all fail with "Element not found"; `find label` does not match a plain div's aria-label either, so hoverable non-control cells carry `role="group"` and are located as `find role group hover --name "2 findings"`. (specs/08-pr-list-findings.flow.json:8, client pulls/_components/FindingsCell/FindingsCell.tsx:112)
- 2026-09-17 — agent-browser clicks dispatch at element coordinates and report "✓ Done" even when the target is below the fold (577px default viewport) — the click silently does nothing; scroll the element into view first (e.g. click the timeline agent name, whose accordion `scrollIntoView`s) before clicking in-page controls. (specs/04-pr-findings.flow.json:15)

## Recurring Errors & Fixes

<!-- newest on top -->

- _none yet_

## Session Notes

<!-- newest on top -->

- _none yet_

## Open Questions

<!-- newest on top -->

- _none yet_
