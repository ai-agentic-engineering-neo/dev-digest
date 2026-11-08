# Spec: Project context for skills   |   Spec ID: SPEC-05   |   Status: approved
Modules: server · client
Supersedes: specs/project-context-folder.md (SPEC-01) — the Non-goal "Attaching docs to skills, and skills passing
them on to agents (design N2c)". Selection, cap and injection rules of SPEC-01 apply to the merged list (AC-6).
Related: [project-context-editable-docs.md](project-context-editable-docs.md) (SPEC-03),
[project-context-agent-tab-and-trace.md](project-context-agent-tab-and-trace.md) (SPEC-04).

## Problem and why

A skill is a reusable review rule shared by several agents ("lethal-trifecta", "secret-leakage-gate"). The doc it
relies on (e.g. `specs/security-baseline.md`) today has to be attached to every agent that uses the skill, and is
forgotten on the next one. Design N2c lets a skill carry its project context: attach the docs once to the skill,
and every agent using it inherits them — with the token cost visible where the docs are attached.

## Goals / Non-goals

Goals
- A **Context** tab in the skill editor: attach/detach/reorder a repo's docs for the skill, with the token sum on the spot.
- Agents inherit the docs of their enabled, linked skills; the agent Context tab shows them and counts their tokens.
- Runs merge the agent's own and inherited docs into one project-context section under the one 4,000-token cap;
  the trace shows which docs came through which skill.

Non-goals
- Path-only skill attachments that apply to any repo (decided: per (skill, repo)).
- A separate cap for skill docs.
- The N2c "Serializes as" preview grouped by source: the section text is defined by SPEC-04 AC-10.
- Carrying doc attachments in skill import, skill versions, or plugin export/import (Settings › Integrations).
- Detaching an inherited doc for a single agent (override); the user detaches it on the skill or unlinks the skill.
- The COVERAGE score.

## User stories

- As a skill author, I attach `specs/security-baseline.md` to `lethal-trifecta` for repo X once, and every agent
  using that skill reads it in reviews of X.
- As an agent owner, I see which docs my agent inherits from its skills and how many tokens all of them add per call.
- As a reviewer, I open a run's trace and see that `specs/security-baseline.md` came "via lethal-trifecta".

## Acceptance criteria (EARS)

- **AC-1** WHEN the user opens a skill's **Context** tab in the skill editor with an active repo, the system SHALL
  show the title "Project context to use", a badge "N attached", the document filter (SPEC-01 AC-3 rule), the hint
  "Any agent using this skill inherits these documents.", and the active repo's docs (repo and `.devdigest`) as
  rows with drag handle, checkbox, file name + folder, source badge and Preview (SPEC-04 AC-1, AC-5), attached first in attach order.
- **AC-2** WHEN the user toggles or reorders a doc in the skill's Context tab (drag handle by mouse, or Arrow
  Up/Down on the focused handle, as SPEC-04 AC-4), the system
  SHALL save the attachment list for that (skill, active repo) pair. Each change survives a reload and creates no
  new skill version.
- **AC-3** The skill's Context tab SHALL show "≈ N tokens" (sum of the attached docs' estimates), the "over 4K soft
  cap" badge while the sum exceeds 4,000, and the SPEC-01 AC-7 "too large" warning for a single doc over 4,000.
- **AC-4** IF the skill has no docs attached for the active repo, THEN the tab SHALL show "No project context
  attached to this skill." with an "Attach documents" action that clears the filter and focuses the list.
  WHILE no repo is active, the tab SHALL ask the user to select a repository. Missing docs show SPEC-01 AC-10's
  "missing" badge with Detach.
- **AC-5** The agent Context tab SHALL list, below the agent's own docs, an "Inherited from skills" group: each doc
  of each enabled skill linked to the agent, for the active repo, with "via <skill name>" (linking to that skill's
  Context tab), read-only (no checkbox, no reorder). A doc that is also attached to the agent itself appears only
  among the agent's own docs. The footer's "≈ N tokens" SHALL include inherited docs, counted once.
- **AC-6** WHEN an agent reviews a PR of repo R, the system SHALL build its doc list for R as: the agent's own
  docs in attach order, then, for each enabled skill linked to the agent in the agent's skill order, that skill's
  docs in attach order; a doc already in the list is not added again. The SPEC-01 selection rules (whole docs,
  "too large", "over cap", "missing", 4,000-token cap) SHALL apply to this merged list, and the section SHALL be
  sent in the SPEC-04 AC-10 form.
- **AC-7** The run trace's "Specs read" row (SPEC-04 AC-6) SHALL mark each inherited doc with "via <skill name>",
  for included and left-out docs alike.
- **AC-8** WHEN the user changes a skill's attachments, links or unlinks a skill to an agent, or enables or disables
  a skill, the system SHALL apply it from the next run of each affected agent; runs already started keep the docs
  they started with. No agent or skill version is created.
- **AC-9** IF a skill is disabled, unlinked from the agent, or deleted, THEN the agent SHALL no longer inherit its
  docs; deleting a skill also deletes its attachments.
- **AC-10** The per-agent run estimate and the recorded run cost SHALL include inherited docs' tokens (× model calls, as in SPEC-01).
- **AC-11** The system SHALL list, attach and inherit docs only for skills, agents and repos in the requesting
  user's workspace; a request naming another workspace's skill, agent or repo SHALL be answered as not found.
- **AC-12** WHERE "Used by N agents" is shown for a doc (Project Context page, doc preview), N SHALL count the
  distinct agents that read the doc for this repo directly or through an enabled linked skill, and its tooltip
  SHALL read "N direct · M via skills" (an agent with both counts as direct).

## Edge cases

- **Same doc on the agent and on two skills:** included once, at its first position (the agent's own); trace shows it once, without "via".
- **Same doc on two skills, not on the agent:** included once via the first skill in the agent's skill order.
- **Many skills each carrying docs:** the merged list can exceed the cap quickly; later docs are "over cap" in the
  trace and the agent tab's sum shows the over-cap badge before any run.
- **Skill linked to agents but no attachments for the PR's repo:** nothing inherited for that repo.
- **Imported (untrusted-source) skill:** its docs are treated like any doc — untrusted data, same wrapping.
- **Repo not cloned:** repo docs follow SPEC-01 / SPEC-03 "not synced" handling; `.devdigest` docs as SPEC-03 decides.
- **Doc deleted (`.devdigest`, SPEC-03 AC-10):** it is detached from skills too, and the delete confirmation counts those skills.

## Non-functional

- **Cost:** `[new: 0 LLM calls]`; inherited docs share the 4,000-token cap, so per-call cost stays ≤ SPEC-01's bound plus SPEC-04's fixed text.
- **a11y:** as SPEC-04 (checkbox, handle, Preview with path in the accessible name; keyboard reorder); "via <skill>" is text, not colour.
- **i18n:** all UI text from message catalogs.

## Inputs (provenance)

- Docs, tokens: `[reused: SPEC-01 discovery + SPEC-03 .devdigest docs]`.
- Skill attachments, agent ↔ skill links, skill enabled flag: `[deterministic: DevDigest's stored skills and attachments]`.
- Section in runs: `[reused: existing review run]` → `[new: 0 LLM calls]`.

## Untrusted inputs

Inherited doc bodies and paths are untrusted exactly like the agent's own docs (SPEC-01, SPEC-04): inside the
engine's untrusted wrapping, never instructions; plain text in the UI. A skill name shown in "via <skill>" is plain text.

## Module interactions

- **Skills (Skills Lab editor):** gains the Context tab (design order: Config · Context · Preview · Evals · Stats · Versions).
- **Agents (Context tab):** shows the inherited group (AC-5).
- **Reviews:** resolves the merged list (AC-6), records "via" per doc in the trace (AC-7), counts tokens (AC-10).
  If reading skill attachments fails, the run proceeds with the agent's own docs and the trace says inherited docs were unavailable.
- **Project Context page (SPEC-03) and doc preview:** "Used by N agents" counts direct and inherited readers (AC-12).
- **reviewer-core, MCP server:** not involved.

## Design review

Sources: `docs/design/devdigest-2/context_docs.jsx` (`SkillContextSection`, `asTab`), `screen_skills.jsx` (skill
editor tabs incl. Context), `screen_agents.jsx`, screenshots of N6 / trace / prompt modal from the user;
`server/specs/skills.md` (skill links, global `enabled`, versions).

User decisions: a separate spec; per (skill, repo); merge agent → skills, no duplicates, one cap; "Used by N
agents" counts direct + via-skill readers with a "N direct · M via skills" tooltip; the N2c "Serializes as"
preview is dropped; no per-agent override for inherited docs; plugin export/import stays out (Non-goals).

Gaps found and how they are covered:
- N2c has no repo selector although docs are per repo → active repo, "select a repository" state (AC-1, AC-4).
- N2c doesn't show in the agent what is inherited → "Inherited from skills" group (AC-5).
- N2c "Serializes as" grouping contradicts the SPEC-04 section form → dropped (Non-goals).
- Disabled / unlinked / deleted skill, duplicates across skills → AC-6, AC-9, Edge cases.
- Settings › Integrations screenshot (plugin export) → not part of this feature (Non-goals).

## [NEEDS CLARIFICATION]

none
