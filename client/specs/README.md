# specs — client

Specs / acceptance criteria for the `client` package. 

Features of THIS module only, one per file: `<feature>.md` — a feature touching ≥ 2 modules has ONE spec in
the root [`specs/`](../../specs/README.md) and a `- see also: ../../specs/<feature>.md` line in the list below. Written BEFORE implementation by the
[`spec-creator`](../../.claude/agents/spec-creator.md) agent from its template (Spec ID `SPEC-NN`, unique across the
repo; EARS acceptance criteria `AC-n`, referenced as `SPEC-NN/AC-n`; no implementation details). Lifecycle:
`draft` → user sets `approved` → `implemented` (by `/implement-plan`). Only an approved spec without
`[NEEDS CLARIFICATION]` can be planned (`implementation-planner`). Specs written before 2026-11-08 have no Spec ID.
`docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [run-cost-badge.md](run-cost-badge.md) — read when showing run/PR cost (`RunCostBadge`, PR-list COST column, timeline, trace Stats)
- [severity-counters.md](severity-counters.md) — read when touching the findings list filters on the PR page (`SeverityCounters`, `FindingsPanel`)
- [pr-list-findings.md](pr-list-findings.md) — read when touching the PR-list FINDINGS column/popover (`FindingsCell`), Timeline severity icons, or `SeverityTally`
- [skills.md](skills.md) — read when changing the Skills page, skill editor/import modals or the agent Skills tab
- [conventions.md](conventions.md) — read when changing the Conventions page (`ConventionsView`, `ConventionCard`) or the "Create skill from conventions" modal
- [multi-agent-review.md](multi-agent-review.md) — read when building/changing the Multi-Agent Review page (`/repos/:repoId/multi-agent`: run config, columns/tabs, "Where agents disagree", agent badge) or promoting `FindingCard`/`RunTraceDrawer`
- see also: [../../specs/project-context-folder.md](../../specs/project-context-folder.md) — SPEC-01 · Project Context page, agent Context tab (attach/order/token cap)
- see also: [../../specs/onboarding-tour.md](../../specs/onboarding-tour.md) — SPEC-02 · Onboarding Tour page (sections, stale banner, regenerate, Copy/Download Markdown)
- see also: [../../specs/project-context-editable-docs.md](../../specs/project-context-editable-docs.md) — SPEC-03 · Project Context page N6 layout, doc tree, Preview | Edit, upload/copy/delete of `.devdigest` docs
- see also: [../../specs/project-context-agent-tab-and-trace.md](../../specs/project-context-agent-tab-and-trace.md) — SPEC-04 · agent Context tab (N2b), trace "Specs read" + Project-context prompt row and search modal
- see also: [../../specs/project-context-for-skills.md](../../specs/project-context-for-skills.md) — SPEC-05 · skill editor Context tab, "Inherited from skills" group in the agent Context tab, "via <skill>" in the trace
- see also: [../../specs/pr-brief.md](../../specs/pr-brief.md) — SPEC-06 · PR Brief card on the Overview tab (empty/generating/ready/error/outdated, Risk areas, Review focus → Files changed scroll), `brief` message catalog
- [pr-brief-extras.md](pr-brief-extras.md) — SPEC-07 · read when touching the PR Brief verdict banner on Overview (newest finished run's verdict, findings/blockers, score, provenance), expandable risk cards, exact-line jump + highlight in Files changed from Review focus / risk refs, or the brief's visual styling (section labels, severity-coloured kind icons, accent file links, Missing-inputs note)
- [intent-layer.md](intent-layer.md) — read when touching the PR-page Intent card (confidence, sources, stale/refresh, user override) or intent hooks/types
