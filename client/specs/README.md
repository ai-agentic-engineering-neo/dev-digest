# client — specs

Feature specs for this package. One file per feature, named
`<feature>.md`. Course lessons (L01–L08) land their specs here.

Suggested sections: Goal · Scope (in / out) · API or UI changes ·
Data model changes · Acceptance criteria · Open questions.

## Index

- [`pages.md`](pages.md) - route contract: every page under `src/app`, its hooks and endpoints, URL params, main components, loading/empty/error states, PR list columns, and the e2e flow that covers it.
- [`run-cost-badge.md`](run-cost-badge.md) — L01 Run Cost Badge: cost + tokens per run on the PR list, timeline, run drawer, and review runs (implemented 2026-09-25; HW2 added delete modals, agent counts, the `/skills/:id` editor with Config / Preview / Versioning, trace skill blocks).
- [`conventions.md`](conventions.md) — HW2 Conventions page: scan controls, candidate cards with Accept / Reject / inline Edit, Create-skill modal with agent picker, states (implemented 2026-09-26).
- [`project-context.md`](project-context.md) — Project context (SPEC-01): `/context` page, Context tab in the agent and skill editors, run drawer blocks, editing a document with a local override (Save, Reset, «Modified locally», unsaved-changes guards), states and tests (implemented 2026-10-20, editing 2026-10-21; API half in `server/specs/project-context.md`).
- [`pr-brief.md`](pr-brief.md) — PR Brief (SPEC-03): PR Brief card states on the PR Overview tab, risk areas in the Intent card, Review focus card, the `?file=&line=` deep link into Files changed, hooks, strings and tests (implemented 2026-10-21; API half in `server/specs/pr-brief.md`).
- [`skills.md`](skills.md) — L02 Skills: `/skills` card grid + side preview/editor, create modal, import drawer with preview, agent editor Skills tab (attach, order, enable), sidebar section, tests and e2e flow (implemented 2026-09-25).
