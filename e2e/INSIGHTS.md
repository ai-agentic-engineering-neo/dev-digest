# Insights — e2e

Lessons learned in `e2e/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->
- 2026-09-22 — scripts/e2e.sh: the hermetic API runs with LLM_PROVIDER_OVERRIDE=mock (server adapters/llm/mock.ts, LLM_MOCK_DELAY_MS=4000) and exports E2E_MOCK_LLM=1; flows with "requiresEnv": "E2E_MOCK_LLM" run a real review end to end (POST → SSE live → persisted findings) with no key, and are SKIPped by run.ts elsewhere; next dev uses NEXT_DIST_DIR=.next-e2e so the dev server's client/.next is untouched (fixes the 2026-09-21 shared-.next entry) → verified 10/10 twice

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->
- 2026-09-22 — agent-browser 0.27 find role button click --name X picks the FIRST match; with a @devdigest/ui Modal open and a same-named page button behind it (conventions 'Create skill'), the click lands on the backdrop, closes the modal and still reports ✓ Done (no request sent) → scope the click to the dialog (eval "[...document.querySelectorAll('[role=dialog] button')].find(…).click()") and assert the API effect
- 2026-09-22 — e2e/flows (agent-browser 0.27): find role checkbox click --name X (and find label X) fails with 'Element not found' when the accessible name comes from a wrapping <label>, which is how the @devdigest/ui Checkbox works → click the label text with find text X click --exact and assert aria-checked via wait --fn (flow 11)
- 2026-09-22 — e2e/flows on the PR page (agent-browser 0.27): the page scrolls inside <main> (overflow:auto), and agent-browser click / scroll / scrollintoview never scroll it, so a find…click on a below-the-fold button reports ✓ Done but hits nothing (no request sent; verified via API state) → start the flow with ['set','viewport','1280','2000'] and assert the effect (e.g. wait --text 'accepted'), never trust the click's exit code
- 2026-09-21 — scripts/e2e.sh:148: the hermetic stack runs a second `next dev` in client/, sharing client/.next with a running dev server, so the dev app on :3000 bakes in NEXT_PUBLIC_API_BASE=:3101 and hangs on skeletons once the hermetic API is torn down → afterwards touch client/src/lib/api.ts (forces recompile with :3001) or restart the dev web; check the browser's Fetch URLs if the UI hangs

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->
- 2026-09-22 — e2e flows 09/10 (mock LLM): in the newest review run the FIRST FindingCard is expanded by default, so 'click the title to expand' collapses it; and after a run the PR is 'reviewed' while the PR list defaults to the 'Needs review' filter, so the PR row disappears → assert the rationale is visible instead of clicking, and click find role button --name All --exact on the list first
- 2026-09-22 — e2e/flows: section labels, badges and popover titles (SectionLabel, FindingsHover title, severity pills) are CSS text-transform:uppercase and wait --text matches the rendered UPPERCASE text case-sensitively ('Timeline', 'Live review', '2 findings in this run' all time out) → assert a non-uppercased neighbour or wait --fn "document.body.innerText.toLowerCase().includes('…')"
- 2026-09-21 — server/src/db/seed.ts inserts reviews+findings for PR #482 but NO agent_runs rows, so in the e2e stack the Agent runs → Timeline has no run tiles (only commits) → UI on timeline tiles (severity counters, cost, hover popover) cannot be asserted in flows; cover it in RunHistory.test.tsx or seed runs first

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->
- 2026-09-22 — .github/workflows/e2e-web.yml pins agent-browser@0.27.0 and runs e2e npm ci + typecheck + lint BEFORE the stack boots → bump the CLI deliberately (flow batch-JSON syntax is version-bound) and update e2e/README + AGENTS together

## Recurring Errors & Fixes
<!-- error message → cause → fix -->
- 2026-09-21 — scripts/e2e.sh (runner step, e2e/package.json test=tsx run.ts): 'sh: tsx: command not found', exit 127, only after the whole stack has booted → e2e/node_modules is missing; run `npm ci` in e2e/ first. agent-browser not on PATH works via a shim script on PATH: `exec npx -y agent-browser "$@"` (v0.27.0)

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
