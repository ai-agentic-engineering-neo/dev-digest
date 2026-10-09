# client — specs

One spec per feature or course lesson, written **before** implementation and kept as
the source of truth while the work is in progress. Cross-package features live in the
package that owns most of the change and link to the others.

- File name: `NNN-short-name.md` (e.g. `001-severity-filter.md`)
- Status: `draft` → `active` → `done` (keep done specs — they explain why code looks the way it does)

## Template

```md
# NNN — <feature>
Status: draft · Lesson: L0X · Related: ../../server/specs/NNN-….md

## Goal
## Non-goals
## UI & routes               (screens, states: loading / empty / error)
## Data                      (hooks, API endpoints, @devdigest/shared contracts)
## Acceptance criteria       (observable, testable)
## Open questions
```
