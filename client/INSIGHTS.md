# Insights — client
<!-- Append-only, written via the engineering-insights skill
     (.claude/skills/engineering-insights/SKILL.md). Newest on top of each section.
     Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> — <why> (<path:line | command>) -->

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-19 · ALWAYS `key={agent.id}` an editor tab that copies server data into local state (e.g. SkillsTab rows) — /agents/:id keeps the tab mounted across agent switches, so stale rows from the previous agent can be saved onto the next one before its query resolves (client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx)
- 2026-10-15 · ALWAYS iterate severities from the zod contract (`CRITICAL | WARNING | SUGGESTION`), NEVER from `SEV`/`Severity` in vendor/ui — the UI tokens (and `SEVERITY_ORDER`, `SEV_COLOR`) also carry `INFO`, which the API never returns, so a loop over `SEV` renders a phantom 4th level (client/src/vendor/shared/contracts/findings.ts:11 vs client/src/vendor/ui/primitives/tokens.ts:3)
- 2026-10-15 · Use `Chip` for toggle filters — it now sets `aria-pressed` (+ optional `disabled`), so test active state with `getByRole("button", { name })` + `toHaveAttribute("aria-pressed", "true")` instead of inspecting styles (client/src/vendor/ui/primitives/Chip.tsx)
- 2026-10-14 · ALWAYS format USD/token counts via `@/lib/format-cost` (`formatCost`, `formatTokenCount`) or `@/components/run-cost-badge` — one rule for all screens, unknown cost is "—", never "$0.00" (client/src/lib/format-cost.ts)

## Tool & Library Notes
- 2026-10-18 · Read uploads with `FileReader.readAsDataURL`, not `file.arrayBuffer()` — jsdom's `File` has no `arrayBuffer`, so component tests crash with `file.arrayBuffer is not a function` (client/src/app/skills/_components/SkillsListView/helpers.ts fileToBase64)

## Recurring Errors & Fixes
- 2026-10-19 · NEVER import a runtime value (zod enum/schema) from `@devdigest/shared` in client code — only `import type`; Next/webpack can't resolve the contracts' `.js` re-exports and the page 500s with `Module not found: Can't resolve './contracts/findings.js'`, while `pnpm typecheck` and vitest both pass. Mirror the list locally under `satisfies Record<…>` (client/src/app/repos/[repoId]/conventions/constants.ts)
- 2026-10-18 · NEVER put `<word>` in a `messages/en/*.json` string — next-intl parses it as an ICU rich-text tag and the message fails with `INVALID_MESSAGE: UNCLOSED_TAG` (renders the key); write placeholders as `[word]` (client/messages/en/skills.json editor.descriptionHint)

## Session Notes
- 2026-10-19 · L02 Conventions: /repos/:repoId/conventions (cards, inline edit, Accept/Reject all, compose-skill modal + attach to agents), nav `g c`, repo switch keeps the page (specs/conventions.md)
- 2026-10-18 · L02 Skills: /skills page (cards, preview drawer, editor, .md/.zip import), agent Skills tab (link/enable/reorder), per-block tokens in trace (specs/skills.md)
- 2026-10-15 · Added per-run severity counters/filter to FindingsPanel (SeverityCounters chips, `severityCounts` helper)

## Open Questions
