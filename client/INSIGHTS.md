# Insights — client

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-14 — `SeverityBadge` already renders icon + label + count
`client/src/vendor/ui/primitives/Badge.tsx:52-88` — `SeverityBadge` takes an optional `count` prop; non-compact it renders icon + uppercase label + count. Wrap it in a plain `<button>` to build a clickable severity counter/filter bar instead of hand-rolling badge markup — done for the findings-by-severity filter in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`.

## Mistake

## Decision

## Context

## Open Questions
