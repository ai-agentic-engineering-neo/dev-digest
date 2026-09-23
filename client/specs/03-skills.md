# 03 — Skills screen + agent Skills tab (client)

Server half, contract and decisions: [`server/specs/03-skills.md`](../../server/specs/03-skills.md).
Status: **approved** (2026-09-22). The client questions are closed (see **Decisions**).

## Goal

1. **/skills**: a **grid of skill cards** with search and an **Add Skill** menu
   (Create / Import from file / Import from URL / Search community). Clicking a card
   opens the editor for that skill.
2. **/skills/[id]**: laid out like the agent editor — the skill list in a left
   sidebar + the editor with tabs Config · Preview · Versions · Stats.
3. **Import flows**: file (`.md` or `.zip`), URL and community all end in one
   **Import preview** modal. Nothing is saved until the user confirms.
4. A **Skills tab** in the Agent Editor: tick which skills the agent uses and
   drag to set their order.

## Decisions

| # | Decision |
|---|---|
| C1 | Add a **SKILLS LAB** sidebar section with Skills (`g s`) and Agents, moved out of WORKSPACE. |
| C2 | Use a real code editor: **CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-markdown`), loaded with `next/dynamic` (`ssr:false`) so only the editor route pays for it. |
| C3 | Use the `diff` (jsdiff) package for version diffs. |
| C4 | Use **`@dnd-kit`** (`core` + `sortable` + `utilities`) for drag and drop. It gives keyboard sensors and touch support. |
| C5 | The agent card fetches its skill count **per agent** (`useAgentSkillLinks(agent.id)`). |
| L  | Layout: grid → master-detail like /agents (list sidebar + tabbed editor). Revised 2026-09-23: the side preview drawer (lesson brief) was dropped; the old `/skills?preview=<id>` redirects to the editor. |

## Routes and structure (`frontend-ui-architecture` conventions)

```
app/skills/page.tsx                       → async RSC: legacy ?preview=<id> → redirect; <SkillsView/>
app/skills/_components/SkillsView/        (header, search, type filter chips, grid)
app/skills/_components/SkillCard/         (type icon+badge, name, description, source, toggle,
                                           "N agents", pull % · accept %)
app/skills/_components/SkillControls/     (enabled switch + trash, shared by SkillCard and SkillListItem)
app/skills/_components/AddSkillMenu/      (Dropdown: create · file · url · community)
app/skills/_components/CreateSkillModal/  (blank form → POST → navigate to editor)
app/skills/_components/ImportUrlModal/    (URL input → preview)
app/skills/_components/CommunitySkillsDrawer/ (search + chips + Import buttons → preview)
app/skills/_components/ImportPreviewModal/(editable name/desc/type, rendered body, included/
                                           ignored files, warnings, trust notice, Confirm)
app/skills/[id]/page.tsx                  → async RSC: await params/searchParams → <SkillEditorView id tab/>
app/skills/[id]/_components/SkillEditorView/ (frame; loading / error pane next to the sidebar)
  _components/SkillWorkspace/             (loaded skill: owns the draft + both leave guards; header + SkillEditor)
  _components/SkillSidebar/               (Add Skill menu + SkillListItem rows, the open one highlighted)
app/skills/[id]/_components/SkillEditor/_components/{ConfigTab,PreviewTab,VersionsTab,StatsTab,BodyEditor}
app/agents/[id]/_components/AgentEditor/_components/SkillsTab/
lib/hooks/skills.ts + skillKeys in lib/hooks/keys.ts
```

- The tab is URL state (`?tab=config|preview|versions|stats`), resolved in `page.tsx`.
  Switching skills in the sidebar (or opening one just created from its Add Skill menu)
  keeps the tab and asks first when the draft is dirty: `SkillWorkspace` owns the draft and
  guards that router.push; links are covered by `useUnsavedChangesGuard`. Views never read
  `useSearchParams`.

## Hooks (`lib/hooks/skills.ts`)

`useSkills`, `useSkillStatsSummary`, `useSkill(id)`, `useCreateSkill`, `useUpdateSkill`,
`useDeleteSkill`, `useSkillVersions(id)`, `useRestoreSkillVersion`, `useSkillAgents(id)`,
`useSkillStats(id)`, `useCommunitySkills(filters)`, `useImportPreview`,
`useAgentSkillLinks(agentId)`, `useSetAgentSkills(agentId)`.

- Keys: `skillKeys = { all, list, stats, detail(id), versions(id), agents(id), statsFor(id), community(f) }`
  plus `agentKeys.skills(id)`. Mutations own invalidation:
  - create → invalidate `list`
  - update/restore → set `detail`, invalidate `list` + `versions(id)`
  - delete → invalidate `list`, `stats`, every `agentKeys.skills(*)`, remove `detail`
  - set agent skills → set `agentKeys.skills(id)`, invalidate `agentKeys.detail(id)` +
    `agentKeys.versions(id)` + `skillKeys.list()` (`used_by`) + `skillKeys.agents(*)`
- The card's enabled toggle is **optimistic** (`list` + `detail`), rolled back on error.

## Config tab

Fields: Name* (kebab slug, validated inline with the contract regex), **Description**
with the hint *"The skill's interface: one directive sentence saying when it applies,
e.g. 'Flag new branches that have no assertion.' The model sees it above the body."*,
Type, the Enabled toggle in the header, and the **Skill body*** CodeMirror editor.

- **Draft pattern:** copy `agents/…/ConfigTab`. The draft holds only touched fields over
  the live cache. Save sends only the draft plus `base_version: skill.version` when
  `body` or `description` is in the draft.
- **Body editor:** CodeMirror (markdown, line numbers, the theme follows the CSS vars),
  file header `<name>.md`, an `unsaved` badge while dirty, `~N tokens` (`ceil(len/4)`).
- Hint under the body: "The text sent to the model, under the skill's name and description."
- Footer: `Save skill` · `Cancel` · "Saving snapshots v{version+1}". The note shows only
  when the body or description is dirty.
- **409 `stale_version`:** toast "Someone saved a newer version", keep the draft, refetch.
- **Unsaved changes guard:** `beforeunload` + a confirm on in-app navigation away
  from the editor.
- **Imported skill banner:** when `source ≠ manual`, show "Imported from <source_ref>. Read
  it before enabling: it becomes instructions in your agents' prompts."
- **Danger zone:** Delete → Modal listing `useSkillAgents` → navigate to `/skills`.

## Preview tab

`<Markdown>` of the **draft** body, captioned "Rendered as the reviewing agent receives
it", and preceded by the exact block header (`### name` + `Applies when:` line).

## Versions tab

"Version history · N versions" and the caption. Each row shows `vN`, the message, the
date, and `Current` on the latest. A row expands to an inline line diff against the
current version (jsdiff `diffLines`). **Restore** asks for confirmation, then POSTs.
It is disabled while the draft is dirty.

## Stats tab

Last 30 days: metric cards Pull rate · Accept rate · Findings, then findings by
category (bar list), findings by severity, and "Used by" (agent links). If the skill
has never been attached, the tab shows an empty state explaining that stats
accumulate from review runs.

## Import preview modal (trust)

Title "Review before importing". It shows the source (file / URL / community + ref),
editable name, description and type, and the rendered body (a toggle switches to
raw). It lists `included_files`, `ignored_files` with reasons (e.g. "scripts/run.sh —
executable, never read"), and the warnings. A fixed notice explains:
*"A skill is instructions injected into your agents' prompts. Only import skills
you have read and trust. Imported skills are saved **disabled**. Enable one after
reviewing it."* **Confirm import** POSTs `/skills` with `source` + `source_ref` and
then opens the editor.

## Agent Editor → Skills tab

- Add `{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" }` to `TABS`.
- Header "Skills · **{linked} of {total} enabled**", a "Filter skills…" input, and the
  caption "Order matters — earlier skills appear earlier in the assembled prompt.
  Drag to reorder."
- Rows: linked skills first, in link order (a sortable dnd-kit list), then the unlinked
  ones by name. Each row has a drag handle, a checkbox, the name, a type badge, and a
  muted "disabled" hint for globally disabled skills.
- Every check, uncheck or drop sends one `POST /agents/:id/skills { skill_ids }`
  (optimistic, rolled back on error). Filtering disables dragging. The keyboard
  sensor supports Space + arrow keys.
- `AgentCard` gets `skillCount` from `useAgentSkillLinks(agent.id)`.

## i18n

Rewrite `messages/en/skills.json` for these flows and delete the unused keys. Add
`agents.editor.tabs.skills` + `agents.skills.*` and `shell` nav keys if needed.

## Acceptance criteria

1. /skills shows the seeded skills as a grid. Search filters by name and description.
   A disabled card is dimmed. The toggle updates instantly and survives a reload.
2. Clicking a card opens `/skills/:id`: the skill list on the left (the open one
   highlighted) and the tabs on the right. Clicking another skill switches on the same tab.
3. Editing only `type` → toast "Saved", version unchanged. Editing the body → `unsaved`,
   footer "…v6". Save → `v6` and a new row at the top of Versions.
4. Preview shows the unsaved draft. Diff on v4 shows added and removed lines. Restore
   v4 → `v7` "Restored from v4".
5. Two tabs: save in A, then in B → B shows the stale toast, and its draft survives.
6. Import a `.zip` with `SKILL.md` + `scripts/` → the preview shows the body and lists
   the script as ignored. Confirm → the card appears disabled with an "Imported" source.
7. URL import of a private address → an error inside the modal. Community search →
   Import → preview → confirm.
8. Agent Editor → Skills: tick 3, drag the 3rd to the top, reload → same order.
9. Deleting a linked skill → the confirm lists the agent. After delete, the agent's
   Skills tab no longer shows it.
10. Every new string lives in `messages/en/*`.

Tests: `renderWithProviders` + `mockFetch`, with no hook mocks. Cover SkillCard toggle,
SkillsView search, ConfigTab (draft, base_version, 409), VersionsTab (restore disabled
when dirty), ImportPreviewModal (ignored files, confirm payload), and SkillsTab
(payload order after toggle + reorder). e2e flow `11-skills.flow.json`: create skill
→ link to agent → mock review → the trace contains the skill.
