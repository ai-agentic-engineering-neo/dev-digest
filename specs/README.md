# specs — cross-module

Specs of features that touch **two or more modules** (`server`, `client`, `reviewer-core`, `mcp`,
`e2e`). A feature that touches one module keeps its spec in `<module>/specs/`. `docs/` describes how
existing code works, `specs/` what to build; `plans/` says how and in what order.

## Which folder

| The feature touches | Spec goes to |
|---|---|
| ONE module | `<module>/specs/<feature>.md` (`server` · `client` · `reviewer-core` · `mcp`; never `e2e/specs/` — those are executable flows) |
| TWO or more modules | ONE file here: `specs/<feature>.md` — never split per module; each touched module's `specs/README.md` gets a "see also" line pointing here |

## How specs are written

- By the [`spec-creator`](../.claude/agents/spec-creator.md) agent, BEFORE implementation, from its
  template (Problem · Goals/Non-goals · User stories · Acceptance criteria (EARS) · Edge cases ·
  Non-functional · Inputs (provenance) · Untrusted inputs · Module interactions · Design review ·
  `[NEEDS CLARIFICATION]`). EARS patterns and examples: the same file, Step 4.
- **Numbering:** `Spec ID: SPEC-NN` is unique across the whole repo (`specs/` + every `*/specs/`).
  Criteria are `AC-1, AC-2…` inside a spec, referenced from plans and reports as `SPEC-NN/AC-n`.
- **Lifecycle:** `draft` → the user sets `approved` (only when no `[NEEDS CLARIFICATION]` is left) →
  `implemented` (set by `/implement-plan` after `plan-verifier` reports COMPLIANT).
  `implementation-planner` plans only from an approved spec; each plan task has `Covers: SPEC-NN/AC-n`.

## Index

<!-- - [file.md](file.md) — SPEC-NN · server, client · read when … -->
- [project-context-folder.md](project-context-folder.md) — SPEC-01 · server, client · read when touching repo doc discovery (READMEs, INSIGHTS.md, nested specs/ + docs/), the Project Context page, the agent Context tab, per-(agent, repo) doc attachments, or the project-context section in review prompts and the run trace (4K token cap, ×N model calls)
- [onboarding-tour.md](onboarding-tour.md) — SPEC-02 · server, client · read when touching the per-repo Onboarding Tour (5 sections, generation model call, grounding of paths/commands, stale/regenerate, Markdown export)
- [project-context-editable-docs.md](project-context-editable-docs.md) — SPEC-03 · server, client · read when touching DevDigest-owned `.devdigest/specs/` docs (new file/folder, `.md` upload ≤ 1 MB, ≤ 200 docs/repo, edit/save, delete + detach, copy repo doc to edit, `.devdigest/` namespace) or the Project Context page layout (two panels, source → folder tree, markdown typography)
- [project-context-agent-tab-and-trace.md](project-context-agent-tab-and-trace.md) — SPEC-04 · server, client, reviewer-core · read when touching the agent Context tab presentation (N2b rows, source badges, cost footer, preview drawer), the trace "Specs read" row / Project-context prompt row + search modal, or the `## Project context` section text sent to the model
- [project-context-for-skills.md](project-context-for-skills.md) — SPEC-05 · server, client · read when touching per-(skill, repo) doc attachments (skill editor Context tab), docs agents inherit from enabled linked skills, the agent → skills merge with one 4K cap, or "via <skill>" in the trace
- [pr-brief.md](pr-brief.md) — SPEC-06 · server, client · read when touching the PR Brief card on the PR Overview tab (Generate/Regenerate, summary, Risk areas, Review focus click-through to Files changed), its single `risk_brief` model call (hunk ranges only, 8K input budget, cut order), grounding of model paths/lines, missing-input notes, cache per head SHA / outdated state
