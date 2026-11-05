# Skills — client

Server half: [../../server/specs/skills.md](../../server/specs/skills.md).

## Goal

Manage reusable, text-only review skills and attach them to agents, following the
"Agent Editor · Skills" design.

## Scope

### Nav
New sidebar section **SKILLS LAB** → Skills (`/skills`, `g s`) and Agents.

### `/skills` — `app/skills/_components/SkillsListView`
- Card grid (`SkillCard`): name (mono), `SkillTypeBadge`, description (2 lines), "imported"
  marker for `community` / `imported_url`, "N agents" usage, global enabled `Toggle`
  (doesn't open the card).
- Click → `SkillPreviewDrawer`: type, version, source, trust notice for imported skills,
  description, rendered markdown body; actions enable toggle / Edit / Delete (confirm).
- **Add Skill** dropdown: *Create from scratch* → `SkillEditorModal`; *Import from file* →
  `ImportSkillModal`.
- `SkillEditorModal`: name (kebab-case, validated), description with the hint that it is the
  skill's interface and should be directive, type, markdown body with Write / Preview. Edit sends
  only changed fields.
- `ImportSkillModal`: choose `.md` / `.zip` → preview (trust notice, warnings, used/ignored files
  with reasons, body) → editable name/description/type → **Save imported skill**. Nothing is saved
  before confirm; confirm re-sends the upload.

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
- `SkillsListView.test.tsx` — card, drawer trust notice, editor validation + patch, import
  preview → confirm, parse error.
- `SkillTypeBadge` on `/showcase` (smoke test).
