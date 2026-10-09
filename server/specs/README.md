# server — specs

One spec per feature or course lesson, written **before** implementation and kept as
the source of truth while the work is in progress. Cross-package features live in the
package that owns most of the change and link to the others.

- File name: `NNN-short-name.md` (e.g. `001-run-cost-badge.md`)
- Status: `draft` → `active` → `done` (keep done specs — they explain why code looks the way it does)

## Template

```md
# NNN — <feature>
Status: draft · Lesson: L0X · Related: ../../client/specs/NNN-….md

## Goal
## Non-goals
## Contracts / API changes   (routes, @devdigest/shared schemas, DB tables)
## Acceptance criteria       (observable, testable)
## Open questions
```
