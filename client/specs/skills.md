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
the URL: `/skills?id=<skillId>&tab=config|preview|evals|stats|versions` (default tab
`config`); `?new=1` = create mode. **Nothing is pre-selected:** without a valid `?id` the right
panel shows "Select a skill — Pick a skill on the left to preview its body."

**Left column** — "Skills" + **Add Skill** dropdown (*Create skill* → create mode in the right panel;
*Import from file* → `ImportSkillModal`, unchanged) + search. Card (`SkillCard`): icon, name (mono),
global enabled `Toggle` and a **trash** icon (→ **Delete skill** modal; neither selects the card; deleting
the open skill clears the selection), description (1 line), `SkillTypeBadge`, "Source · vN"
(Manual · Extracted · Community · Imported, with icon), and a stats row
"N agents · X% pull · Y% accept" (`—` when no data) from `GET /skills/stats`. Selected card is
highlighted. Imported (community / imported_url) cards keep the warn marker.

**Right panel header** — icon, name, type badge, `vN` chip, **Run on evals** (disabled, tooltip
"Evals arrive with the Eval lesson"). Tabs (with icons): Config (gear) · Preview (eye) · Evals (flask) · Stats (chart) · Versions (history).

- **Config** — header: "Configuration" + `vN` + **Enabled** toggle (saves at once, no version bump)
  + **Discard** (only while dirty) + **Save** (only changed fields; content change → new version,
  toast "Saved as vN"). Fields: Name (kebab-case), Description (directive hint), Type (native select,
  capitalised labels); **Skill body (Markdown)** editor: `<name>.md` header, `unsaved` badge while
  dirty, `~N tokens`, line-numbered textarea, hint "Saving a changed body creates a new immutable
  version."; optional **What changed?** note. Delete (same modal) at the bottom. Switching skills/tabs with unsaved edits asks to discard.
  Create mode: same form, empty, **Create skill** → selects the new skill.
- **Preview** — "Rendered as the reviewing agent receives it." + rendered markdown; imported skills
  show the trust notice (wrapped as `<untrusted>` in the prompt).
- **Evals** — placeholder empty state: evals arrive with the Eval lesson.
- **Stats** — tiles USED BY (agents) · PULL FREQUENCY (%) · ACCEPT RATE (% + ring) · FINDINGS (30D);
  "Agents using this skill" list with **Open** (→ `/agents/:id?tab=skills`); "Findings by category"
  donut + legend with **counts**. Note: stats cover runs since run attribution shipped; empty state
  when there were no runs.
- **Versions** — "Version history" + "N versions" chip + hint "Every save snapshots the body…".
  Rows newest first: `vN`, note, date; every row has **View / Hide** (the version's body inline);
  newest = **Current** badge; older rows also: **Diff** (line diff of
  that version vs current, in a modal) and **Restore** (confirm → `PUT { body, note: "Restored from
  vN" }` → new current version).

The old `SkillPreviewDrawer` and `SkillEditorModal` are removed (replaced by the panel tabs).

### Agent Editor → **Skills** tab (`?tab=skills`) — `AgentEditor/_components/SkillsTab`
- One column, max 1060px (header, hint, filter and rows line up on wide screens): "Skills" + "N of
  M enabled" (plain text, right); hint "Turn a skill on to add it to this agent's prompt. Order
  matters … Drag the handle or use the arrows to reorder."; full-width filter.
- Every workspace skill is a row: drag handle (linked rows only), **toggle** (on = linked; aria
  "Use <name> in this agent", tooltip explains on/off), name + one-line description (not clickable — only the
  switch saves, so selecting / double-clicking the name never does), imported / "disabled globally" markers (with tooltips), ↑/↓ for linked rows
  (tooltips "Move up — earlier in the prompt"), type badge, and the prompt position **#1, #2…**
  for linked rows (tooltip "Position N in the assembled prompt"). No unexplained icon.
- Linked rows first, in prompt order; on appends, off removes, drag/arrows reorder. Each
  change saves immediately (`POST /agents/:id/skills { skill_ids }`, optimistic).
- Agent cards show the linked-skill count (`useAgentSkillCounts`, shared cache with the tab).

### Run trace
Prompt assembly → **Skills** block shows `~N tokens` (chars/4 estimate); exact cl100k count is in
the run log line `Skills: N attached …`.

## Acceptance criteria
- `SkillsTab.test.tsx` — order, counter, toggle on/off (name click does nothing), position / description / tooltips, arrows, drag & drop, markers, filter.
- `SkillsLab.test.tsx` — list + search + card stats row / source · version, no default selection,
  Delete skill modal (cancel / Esc, confirm, locked while deleting, error kept), URL selection/tab, Config save (patch +
  note) / discard / create mode / validation, Preview trust notice, Stats tiles + agents + categories,
  Versions current/view/diff/restore, Evals placeholder, import preview → confirm, parse error.
- `SkillTypeBadge` on `/showcase` (smoke test).

### Delete confirmation (`components/confirm-dialog`)
Deleting a skill (card trash, Config → Delete) or an agent (AgentCard trash) opens a compact modal
instead of `window.confirm`: title "Delete skill" / "Delete agent", body "\"<name>\" will be permanently
removed… This cannot be undone.", **Cancel** (focused first, so a stray Enter can't delete) and a red
**Delete**. Esc, ✕ and the backdrop cancel. While the DELETE runs the modal is locked: Delete shows a
spinner + "Deleting…", Cancel / ✕ / backdrop / Esc do nothing, so a double click can't send a second
request. Success → modal closes + toast ("Skill deleted" / "Agent deleted"); deleting the open
skill clears the selection, deleting the open agent returns to `/agents`. Failure → the error is
shown inside the modal and the user can retry. `ConfirmDialog` takes translated labels from the
caller (`skills.deleteDialog.*`, `agents.deleteDialog.*`); `DeleteSkillDialog` /
`DeleteAgentDialog` own the mutation. AgentCard renders the modal next to the card (not inside),
so modal clicks don't select the card. Tests: `SkillsLab.test.tsx`, `AgentCard.test.tsx`.
