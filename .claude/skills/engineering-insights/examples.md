# Engineering Insights — examples

What a good entry looks like (and what gets rejected), per section. Every ✅
entry follows the contract format:

`- YYYY-MM-DD — one actionable sentence. (file-or-PR ref)`

The ❌ entries are real failure modes: vague, no action, no context.

## ❌/✅ per section

### What Works

- ❌ `- 2026-09-16 — DI container is useful for tests. (server)` — nothing to repeat, no context.
- ✅ `- 2026-09-16 — Swapping the GitHub adapter for its mock is one line of test setup via the DI container; keep every new external call behind an adapter port so it inherits this. (server/src/platform/di.ts)`

### What Doesn't Work

- ❌ `- 2026-09-16 — JSON parsing can be flaky. (reviewer-core)` — no cause, no alternative.
- ✅ `- 2026-09-16 — parseWithRepair can't recover when max_tokens truncates JSON mid-finding — raise the token budget first, don't blame the Zod schema. (reviewer-core/src/llm/structured.ts)`

### Codebase Patterns

- ❌ `- 2026-09-16 — Be careful with translations. (client)` — a warning, not knowledge.
- ✅ `- 2026-09-16 — UI copy edits must touch every locale file in one change — editing only messages/en.json leaves uk rendering stale text, and no test catches it. (client/messages/uk.json)`

### Tool & Library Notes

- ❌ `- 2026-09-16 — agent-browser selectors are tricky. (e2e)` — trivia, not a quirk with an action.
- ✅ `- 2026-09-16 — agent-browser's find role=button misses links styled as buttons — match by exact text label instead; --text waits are the reliable assertion surface in this stack. (e2e/specs/04-pr-findings.flow.json)`

### Recurring Errors & Fixes

- ❌ `- 2026-09-16 — pnpm can cause problems. (client)` — the error message and the fix are the whole point; both are missing.
- ✅ `- 2026-09-16 — pnpm ≥10 silently blocks esbuild's postinstall; the "command not found" error looks like a client bug but the fix is approving the build in client/pnpm-workspace.yaml allowBuilds. (client/pnpm-workspace.yaml)`

### Session Notes

- ❌ `- 2026-09-16 — Discussed polling config. (server)` — a diary line; the decision and its reason are gone.
- ✅ `- 2026-09-16 — Decided polling cadence stays in platform/jobs config rather than DB settings — revisit if operators ever need per-repo intervals. (server/src/platform/jobs.ts)`

### Open Questions

- ❌ `- 2026-09-16 — Search results sometimes stale. (server)` — no reproduction path, no ref.
- ✅ `- 2026-09-16 — Why does repo search return stale results right after a re-index? Suspect vector-index refresh lag — reproduce before touching the query. (server/src/modules/repo-intel)`

## What not to capture

- Anything obvious from reading the code or the git log — the litmus test fails.
- One-off fixes with no lesson (typos, renames, mechanical edits).
- Stable conventions, how-tos, or behavior decisions → module `README.md`,
  `docs/`, or `specs/` instead (e2e: the flow spec). That's the redirect rule.
- Anything already recorded in an INSIGHTS.md — dedup before writing.
- Session chatter, plans, and todos — only confirmed knowledge belongs here.

## Worked mini-scenario

A 45-minute session debugging a flaky `e2e` flow 02 (repo-pulls-detail),
run against the hermetic stack.

**Captured (2):**

- e2e → What Doesn't Work:
  `- 2026-09-16 — Flow 02's wait --text "PR" matches the loading skeleton before data lands — wait for a string unique to the loaded state (e.g. the PR title) instead. (e2e/specs/02-repo-pulls-detail.flow.json)`
- e2e → What Works:
  `- 2026-09-16 — Pairing wait --url with a follow-up wait --text on page content makes client-side navigations deterministic — the URL settles before hydration, text proves the DOM is ready. (e2e/specs/01-app-boot.flow.json)`

**Rejected (4):**

- "The runner substitutes `{BASE}` in commands" — obvious from `run.ts`.
- "Flows are ordered JSON command lists" — README material (redirect).
- "Locators must be deterministic, never the AI `chat` command" — already in
  e2e/CLAUDE.md Hard rules (duplicate).
- "The runner could use better error messages" — vague, no action.
