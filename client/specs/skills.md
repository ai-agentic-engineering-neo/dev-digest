# Skills — client

Server half: [../../server/specs/skills.md](../../server/specs/skills.md).

## Goal

Manage reusable, text-only review skills and attach them to agents, following the
"Agent Editor · Skills" design.

## Scope

### Nav
New sidebar section **SKILLS LAB** → Skills (`/skills`, `g s`) and Agents.

### `/skills` — master-detail (designs "Skills · Config / Preview / Stats / Versions")
`app/skills/_components/SkillsLab` — left list column + right detail panel. Selection and tab live in
the URL: `/skills?id=<skillId>&tab=config|preview|evals|stats|versions` (default: first skill,
`config`); `?new=1` = create mode.

**Left column** — "Skills" + **Add Skill** dropdown (*Create skill* → create mode in the right panel;
*Import from file* → `ImportSkillModal`, unchanged) + search. Card (`SkillCard`): icon, name (mono),
global enabled `Toggle` (doesn't select), description (1 line), `SkillTypeBadge`, source label
(Manual · Extracted · Community · Imported, with icon), and a stats row
"N agents · X% pull · Y% accept" (`—` when no data) from `GET /skills/stats`. Selected card is
highlighted. Imported (community / imported_url) cards keep the warn marker.

**Right panel header** — icon, name, type badge, `vN` chip, **Run on evals** (disabled, tooltip
"Evals arrive with the Eval lesson"). Tabs: Config · Preview · Evals · Stats · Versions.

- **Config** — "Configuration" + `vN` + **Enabled** toggle (saves at once, no version bump); Name
  (kebab-case), Description (directive hint), Type; **Skill body** editor: `<name>.md` header,
  `unsaved` badge while dirty, `~N tokens`, line-numbered textarea. Below: optional **What changed?**
  note + **Discard** / **Save** (only changed fields; content change → new version, toast "Saved as
  vN"). Delete (confirm) lives here too. Switching skills/tabs with unsaved edits asks to discard.
  Create mode: same form, empty, **Create skill** → selects the new skill.
- **Preview** — "Rendered as the reviewing agent receives it." + rendered markdown; imported skills
  show the trust notice (wrapped as `<untrusted>` in the prompt).
- **Evals** — placeholder empty state: evals arrive with the Eval lesson.
- **Stats** — tiles USED BY (agents) · PULL FREQUENCY (%) · ACCEPT RATE (% + ring) · FINDINGS (30D);
  "Agents using this skill" list with **Open** (→ `/agents/:id?tab=skills`); "Findings by category"
  donut + legend with **counts**. Note: stats cover runs since run attribution shipped; empty state
  when there were no runs.
- **Versions** — "Version history" + "N versions" chip + hint "Every save snapshots the body…".
  Rows newest first: `vN`, note, date; newest = **Current** badge; older rows: **Diff** (line diff of
  that version vs current, in a modal) and **Restore** (confirm → `PUT { body, note: "Restored from
  vN" }` → new current version).

The old `SkillPreviewDrawer` and `SkillEditorModal` are removed (replaced by the panel tabs).

### Agent Editor → **Skills** tab (`?tab=skills`) — `AgentEditor/_components/SkillsTab`
- "Skills" + "N of M enabled" badge + filter; hint "Order matters … Drag to reorder."
- Every workspace skill is a row: drag handle, checkbox (checked = linked), name, imported /
  "disabled globally" markers, ↑/↓ for linked rows, type badge.
- Linked rows first, in prompt order; check appends, uncheck removes, drag/arrows reorder. Each
  change saves immediately (`POST /agents/:id/skills { skill_ids }`, optimistic).
- Agent cards show the linked-skill count (`useAgentSkillCounts`, shared cache with the tab).

### Run trace
Prompt assembly → **Skills** block shows `~N tokens` (chars/4 estimate); exact cl100k count is in
the run log line `Skills: N attached …`.

## Acceptance criteria
- `SkillsTab.test.tsx` — order, counter, check/uncheck, arrows, drag & drop, markers, filter.
- `SkillsLab.test.tsx` — list + search + card stats row, URL selection/tab, Config save (patch +
  note) / discard / create mode / validation, Preview trust notice, Stats tiles + agents + categories,
  Versions current/diff/restore, Evals placeholder, import preview → confirm, parse error.
- `SkillTypeBadge` on `/showcase` (smoke test).
