# Skills for review agents

**Status:** in progress
**Packages touched:** server, client, `@devdigest/shared`, reviewer-core (read-only: the prompt slot already exists)

## Problem

Review agents only know their system prompt. Team rules (a test-quality rubric, an
API-contract checklist) cannot be attached, ordered or switched per agent, and a
third-party skill cannot be brought in safely.

## Scope — in

- **Storage & list.** Server module `skills` with CRUD over the `skills` table
  (database is the source of truth; body edits write `skill_versions`).
- **Skills page (master–detail).** `/skills` is two panes (see *Screens* below):
  left a searchable list of skill cards, right the selected skill with tabs
  **Config · Preview · Stats**. "Add Skill" offers *Create* / *Import*.
- **Editor (Config tab).** Form: name, description, type, markdown body. The
  description is the skill's interface — written as a directive ("Use when… /
  Check that…") and the field caption says so.
- **Agent binding.** Agent editor tab *Skills*: attach, per-agent enable/disable,
  reorder. Order = order of the blocks in the prompt. Needs `agent_skills.enabled`.
- **Import.** Upload a `.md` file or a `.zip`; the server extracts the skill core
  (`SKILL.md` or the first `.md`) and returns a **preview**. Nothing is stored until
  the user confirms. Anything executable/non-markdown in the archive is listed as
  ignored and never read or run. The preview states the trust problem: an imported
  skill is someone else's instructions inside your agent's prompt.
- **New agents.** *Test Quality Reviewer* (uncovered branches, missed corner cases,
  over-mocking, flakes) and *API Contract Reviewer* (breaking route/contract
  changes). Each gets its own skills; at least one skill is created through import.
- **Observability.** Enabled skills appear as a separate block in the run log and in
  the trace's prompt-assembly section with their token cost; disabled ones do not.

## Screens

Reference designs: three screenshots of the Skills page (Config, Preview, Stats).

**Skill list (left pane, all tabs).** Header "Skills" + primary **Add Skill** menu
(Create / Import from file); search box; one card per skill: type-coloured icon,
name (monospace), **enabled switch**, one-line description, type badge, **source
label** (Manual · Extracted · Community · Imported), and a stats footer
`N agents · P% pull · A% accept` (a dash when a value is unknown). The selected card is
highlighted. Selection and tab live in the URL (`/skills?id=<uuid>&tab=config`).

**Detail header.** Icon, name, type badge, version chip `vN`. (The mockup's
*Run on evals* button is not built.)

**Config tab.** Title "Configuration" + version chip, **Enabled** switch (top right).
Fields: **Name\***, **Description** (directive caption), **Type** (select),
**Skill body\*** — a markdown editor with a file header (`<name>.md`), an `unsaved`
badge while the form differs from the saved skill, a token estimate (`N tokens`), and a
line-number gutter. Save / Discard; saving a changed body creates version N+1.

**Preview tab.** "Rendered as the reviewing agent receives it": the body rendered as
markdown; for third-party sources (imported/community) the same "third-party skill"
note the prompt carries is shown first.

**Stats tab.** Four tiles — **Used by** (N agents), **Pull frequency** (%),
**Accept rate** (% + ring), **Findings (30d)** — then **Agents using this skill** (each
with an *Open* link to that agent's Skills tab) and **Findings by category** (donut +
legend with counts). Empty state when there are no runs in the window.

## Stats definitions (server, last 30 days by `agent_runs.ran_at`)

Only runs with status `done` of agents that have the skill linked count.

- **Used by** — agents with an `agent_skills` link to the skill (enabled or not).
- **Pull frequency** — runs whose trace `prompt_assembly.skills` contains the skill's
  block (`### <name>`) ÷ all such runs. Null when there are no runs.
- **Findings** — findings of the pulled runs (through `reviews.run_id`).
- **Accept rate** — accepted ÷ (accepted + dismissed) over those findings. Null when
  none is decided yet.
- **By category** — those findings grouped by `category`.

Limitation: pulls are matched by the skill name, so a renamed skill starts a fresh
history under its new name.

## Scope — out

- **Evals** tab, the **Run on evals** button and the **Versions** tab of the mockup.
- URL / community-catalog import (UI keeps the existing placeholders).
- Skill-owned eval cases, skill marketplace, restore-version UI.

## Contract changes (`@devdigest/shared` first)

- `SkillSource` += `imported_file`.
- `SkillInput`, `SkillUpdate`, `SkillImportRequest`, `SkillImportPreview` (new).
- `AgentSkillLink` += `enabled`.
- `SkillStatsSummary` (list footer) and `SkillStats` (Stats tab) — new.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/skills` | list (workspace-scoped) |
| POST | `/skills` | create (manual, or confirm of an import) |
| GET | `/skills/:id` | one skill |
| PUT | `/skills/:id` | update fields / `enabled`; body change bumps `version` |
| DELETE | `/skills/:id` | delete (links cascade) |
| POST | `/skills/import/preview` | parse `{filename, content_base64}` → preview, **stores nothing** |
| GET | `/skills/stats` | `SkillStatsSummary[]` for every skill (list card footers) |
| GET | `/skills/:id/stats` | `SkillStats` for the Stats tab |
| PUT | `/agents/:id/skills/:skillId` | `{enabled?, order?}` per-agent link switch/order |
| DELETE | `/agents/:id/skills/:skillId` | unlink |

`POST /agents/:id/skills` (set/reorder, link one) already exists; reorder preserves
each link's `enabled`.

## Acceptance criteria

- A skill can be created, edited, disabled and deleted in the UI; the database holds it.
- Import shows a preview and stores nothing until confirmed; a `.zip` containing
  `scripts/*.sh` stores only the markdown core and lists the script as ignored.
- A skill reaches a run's prompt only when the skill's `enabled` **and** the agent
  link's `enabled` are both true; order follows the link order.
- The run log has one `skills:` line with names and `+~N tokens`; the trace
  prompt-assembly `skills` section is empty when none apply.
- Both new agents have skills linked after `seed`.
- The Skills page matches the three reference screens: list with stats footers, and
  Config / Preview / Stats tabs; the Config form shows `unsaved` and a token estimate.
- Stats match the definitions above (covered by a DB-backed test that creates runs,
  findings, accepts and dismissals).
- Control experiment reproducible on both new agents (see `docs/skills/README.md`).

## Open questions

- Token budget cap per agent for skills (currently a warning only).
