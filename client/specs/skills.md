# Skills (L02) — client

Manage reusable review rules and attach them to agents. Data model and API are
in [`server/specs/skills.md`](../../server/specs/skills.md).

Status: **implemented 2026-09-25**, extended 2026-09-26 for HW2: delete
buttons with a confirm modal, `agent_count` on cards, the `/skills/:id`
editor with Config / Preview / Versioning tabs (diff + restore), per-skill
token blocks in the run trace.

## Surfaces

| # | Where | Hooks | What |
|---|---|---|---|
| 1 | `/skills` (`SkillsView`) | `useSkills`, `useUpdateSkill` | master-detail (2026-10-21): a Skills column on the left (heading, **Add Skill** dropdown → *Create from scratch* (modal) / *Import from file* (drawer), search, one `SkillCard` per skill: type-coloured icon chip, mono name as a `<button>` with `aria-pressed`, enabled toggle, one-line description, type tag, source with icon, «needs vetting» badge (imported and still disabled), `N agents`) and the `SkillEditor` inline on the right for `?skill=<id>` (the first skill when none is named; a card click keeps `?tab=`). Deleting lives in the editor's Config tab |
| 2 | `/skills/[id]` → redirect to `/skills?skill=<id>`; `SkillEditor` (rendered by `SkillsView`) | `useSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`, `useSkillVersionDiff`, `useRestoreSkillVersion` | header with icon chip, mono name, type tag, `vN`, source, agent count, badges; `?tab=config\|context\|preview\|versioning` (Config, Context, Preview, Versions): **Config** = `SkillForm` + Save + Delete (modal); **Context** = `specs/project-context.md`; **Preview** = the body rendered as Markdown; **Versions** = every version newest first with a `current` badge, **Diff** (server unified patch rendered by `PatchView`, with «N added · M removed against vX») and **Restore** (confirm modal, then a new version) on previous versions |
| 3 | `/agents/[id]?tab=skills` (`SkillsTab`) | `useSkills`, `useAgentSkills`, `useSetAgentSkills` | one row per workspace skill, derived in render from the two queries: drag grip, checkbox (= linked), name, `disabled` badge when disabled globally, type tag, ↑/↓ for linked rows; «N of M enabled» badge; filter; every change saves at once through an optimistic write to the `["agent-skills", id]` cache (rolled back on error) and bumps the agent version |
| 4 | Sidebar | — | new **SKILLS LAB** section: Skills (`g s`), Agents (`g a`); `nav.ts` in `vendor/ui` was edited for this |
| 5 | Agent cards | `useDeleteAgent` | «N skills» badge from `Agent.skill_count`; Delete opens `ConfirmDialog` (no more `window.confirm`) |
| 6 | Run trace drawer → Prompt assembly | — | the Skills block label carries «N skills · T tokens» (`prompt_assembly.skills_tokens`) and one collapsible sub-block per enabled skill, «↳ Skill · name (vN) · T tokens» (`skill_blocks`); a disabled skill has no block |

The skill editor also has a Context tab (project documents the skill
attaches) and the agent editor a Context tab; both are specified in
[`project-context.md`](project-context.md).

`SkillForm` (name, description, type, body, enabled) is shared by the create
modal, the import drawer and the panel's edit mode. The description field's
hint says it is the skill's interface and must be written as a directive.

## Import flow (`ImportSkillDrawer`)

1. Choose a `.md` / `.zip` file → read as base64 → `POST /skills/import/preview`.
2. Preview: trust notice, source entry, notes (derived fields, ignored
   executables), ignored archive entries (mono list), and the editable form
   pre-filled with `enabled = false`.
3. **Import skill** → `POST /skills { …form, source: "imported_file" }` →
   toast → `/skills/<id>`. Cancel discards everything; nothing is stored
   before step 3.

## States

- Grid: 3 skeleton cards while loading; `ErrorState` with retry; `EmptyState`
  with a create CTA when the workspace has no skills; a «No matching skills»
  empty state when the search excludes all.
- Panel: skeleton; «Skill not found» error state; imported skills show the
  vetting notice above the body.
- Skills tab: skeleton rows; `EmptyState` linking to `/skills` when the
  workspace has no skills; «No skills match "…"» under an active filter.
- Toasts: `Skill saved (vN)`, `Skill deleted`, `Imported "name"`,
  `Skills saved`; mutation failures use the global error toast. A file that
  cannot be read in the browser shows inline in the import drawer.
- The editor's tabs are keyed by `id:version`, so a save or restore remounts
  the form. Cards are keyboard-operable (the name is a real `<button>`).

## Tests

| File | Covers |
|---|---|
| `SkillsTab/helpers.test.ts` | linked-first ordering, `moveId`, filter |
| `SkillsTab/SkillsTab.test.tsx` | count badge, row order, attach/detach payloads, arrow reorder payload |
| `SkillsView/SkillsView.test.tsx` | column + inline editor, first-skill auto-select, search, empty state |
| `ImportSkillDrawer/ImportSkillDrawer.test.tsx` | upload → preview → ignored entries → confirm with `source: imported_file`, nothing saved before confirm |
| `../../e2e/specs/10-skills.flow.json` | seeded card, side preview, agent Skills tab count and rows |
