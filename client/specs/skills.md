# Skills (L02) — client

Manage reusable review rules and attach them to agents. Data model and API are
in [`server/specs/skills.md`](../../server/specs/skills.md).

Status: **implemented 2026-09-25** (`/skills`, `/skills/[id]`, agent editor
Skills tab, import drawer, sidebar section, unit tests, e2e flow `10-skills`).
Written 2026-09-25.

## Surfaces

| # | Where | Hooks | What |
|---|---|---|---|
| 1 | `/skills` (`SkillsView`) | `useSkills`, `useUpdateSkill` | card grid: mono name, type tag, description, `vN · source`, «needs vetting» badge (imported and still disabled), enabled toggle; search; **Add Skill** dropdown → *Create from scratch* (modal) / *Import from file* (drawer) |
| 2 | `/skills/[id]` | `useSkill`, `useUpdateSkill`, `useDeleteSkill` | same grid with the selected card outlined and `SkillPanel` on the right: badges, description, Markdown body, Edit → `SkillForm` inline, Delete (confirm) |
| 3 | `/agents/[id]?tab=skills` (`SkillsTab`) | `useSkills`, `useAgentSkills`, `useSetAgentSkills` | one row per workspace skill, derived in render from the two queries: drag grip, checkbox (= linked), name, `disabled` badge when disabled globally, type tag, ↑/↓ for linked rows; «N of M enabled» badge; filter; every change saves at once through an optimistic write to the `["agent-skills", id]` cache (rolled back on error) and bumps the agent version |
| 4 | Sidebar | — | new **SKILLS LAB** section: Skills (`g s`), Agents (`g a`); `nav.ts` in `vendor/ui` was edited for this |
| 5 | Agent cards | — | «N skills» badge from `Agent.skill_count` |

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
- `SkillPanel` is keyed by the selected id, so switching skills remounts it
  and leaves edit mode. Cards are keyboard-operable (`role="button"`, Enter/Space).

## Tests

| File | Covers |
|---|---|
| `SkillsTab/helpers.test.ts` | linked-first ordering, `moveId`, filter |
| `SkillsTab/SkillsTab.test.tsx` | count badge, row order, attach/detach payloads, arrow reorder payload |
| `SkillPanel/SkillPanel.test.tsx` | preview badges, edit mode, save payload |
| `ImportSkillDrawer/ImportSkillDrawer.test.tsx` | upload → preview → ignored entries → confirm with `source: imported_file`, nothing saved before confirm |
| `../../e2e/specs/10-skills.flow.json` | seeded card, side preview, agent Skills tab count and rows |
