# client insights

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-17 — Component tests don't mock global `fetch` despite `CLAUDE.md` saying "fetch mocked"; they `vi.mock()` the specific data hook module by relative path instead. Mock the hook, not `fetch`, when writing a new component test. (`client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx:9`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-17: Verified engineering-insights skill against a checklist (items 8-11): confirmed component-test fetch-mocking pattern (see Codebase Patterns) as a real test case for module-scoped writes.

## Open Questions
