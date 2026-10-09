# reviewer-core — specs

One spec per engine change or course lesson, written **before** implementation and kept
as the source of truth while the work is in progress. Engine features are usually driven
by the server — link the server spec when one exists.

- File name: `NNN-short-name.md` (e.g. `001-skills-slot.md`)
- Status: `draft` → `active` → `done` (keep done specs — they explain why code looks the way it does)

## Template

```md
# NNN — <feature>
Status: draft · Lesson: L0X · Related: ../../server/specs/NNN-….md

## Goal
## Non-goals
## Pipeline change           (prompt slots, structured output, grounding, run/reduce)
## Public API / contracts    (src/index.ts exports, @devdigest/shared types)
## Safety                    (untrusted inputs wrapped? grounding still enforced?)
## Acceptance criteria       (testable with a stubbed LLMProvider)
```
