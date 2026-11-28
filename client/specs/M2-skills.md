# M2 — Skills (client)

Status: draft

## Problem

Agents can link skills on the server, but the studio has no way to see, write,
import or version a skill, and no way to choose which skills an agent loads or
in what order. A reviewer reading a run trace cannot tell which skills went
into the prompt or what they cost in tokens.

## Goals

- `/skills` lists every skill as a card and opens one in a detail pane with six
  tabs: Config, Context, Preview, Evals, Stats, Versions.
- Config, Preview and Versions work in full. Context, Evals and Stats show an
  empty state that names their milestone (M5, M6, M7).
- A skill can be created from a form or imported from a `.md` or `.zip` file.
  An import is saved only after the user has seen a preview and a trust warning.
- Every save creates a new version with an optional change note. Any older
  version can be diffed against the current one and restored as a new version.
- The agent editor gets a Skills tab: attach, detach, enable per link and
  reorder, where the order is the order of the skill blocks in the prompt.
- The run trace shows which skills were loaded, at which version, and how many
  tokens they added.

## Non-goals

- Context (M5), Evals (M6) and Stats (M7) content, the "Run on evals" action,
  and the card's pull % and accept % figures. Their designs are recorded under
  [Future tabs](#future-tabs).
- Import from a URL or the community catalogue (the old `skills.json` keys for
  them are removed).
- Markdown syntax colouring in the body editor; it is a plain monospace editor
  with line numbers.
- A guard on browser-level navigation (closing the tab, typing a URL). In-app
  navigation away from unsaved edits is guarded (see Decisions).
- Agent editor tabs other than Config and Skills (Evals, Stats, CI in design 1).
- Run count, accept % and average cost on `AgentCard` (design 1).
- Running or showing any executable from an imported archive. The client never
  reads anything but the preview the server returns.

## Behaviour

### Layout and navigation

- The sidebar gets a `SKILLS LAB` group with **Skills** (`/skills`, `g s`) and
  **Agents** (moved from `WORKSPACE`). `activeKeyFor` already maps `/skills`.
  Conventions and Eval Dashboard in the design are not added.
- Breadcrumb: `Skills Lab › Skills`.
- `/skills` and `/skills/[id]` share one layout, the same as `/agents/[id]`: a
  280 px left column with the list and a right detail pane.
  - `/skills` with skills: the right pane shows the "Select a skill" prompt.
  - `/skills` with no skills: the right pane shows an `EmptyState` with
    **Create skill** and **Import skill**.
  - `/skills/[id]` that 404s: "Skill not found" with a link back to `/skills`.
- The tab lives in `?tab=config|context|preview|evals|stats|versions`; an
  unknown or missing value means `config`. Clicking a card keeps the tab.

### Skill list (left column, designs 3–8)

- Header: `Skills` and a primary **Add Skill ▾** `Dropdown` with two items:
  **Create skill** and **Import from file**.
- A search box filters cards by name and description, case-insensitive,
  locally.
- Each card, top to bottom:
  - a square icon (`Sparkles`) tinted by type, the name in mono, and an enabled
    `Toggle` on the right. Toggling calls `PATCH /skills/:id/enabled` at once
    and does not open the skill;
  - the description, one line, ellipsised;
  - a type badge (`rubric` accent, `convention` ok/green, `security` crit/red,
    `custom` muted) and a source label with an icon: `Manual` (Pencil),
    `Extracted` (Wrench), `Community` (Globe), `Imported` (Upload);
  - a divider, then `N agents` (`1 agent` singular) from `agent_count`. The
    pull % and accept % slots are not rendered until M7.
- A disabled skill's card is dimmed (same treatment as a disabled `AgentCard`).
  The selected card has the active border.
- Loading: two skeleton cards. Error: an inline `ErrorState` with retry.

### Detail header

- Type-tinted icon, the name in mono, the type badge, and a `vN` badge with the
  `GitCommit` icon.
- **Run on evals** (`Play`, secondary) on the right is disabled; hovering it
  shows "Eval runs arrive in M6". The kit has no tooltip, so the button sits in
  a `span` that carries the `title` (a disabled button fires no hover events).
- Tabs below the header: Config, Context, Preview, Evals, Stats, Versions.

### Config tab (design 3)

- Title **Configuration** with a `vN` badge; on the right `Enabled` and a
  `Toggle` (the same call as the card toggle; not part of the form).
- Fields:
  - **Name\*** — text input, mono.
  - **Description** — text input, with the hint: "This is the skill's
    interface: the model reads it to know what the skill is for. Phrase it as
    a directive — 'Flag …', 'Reject …', 'Prefer …'."
  - **Type** — `SelectInput`: rubric, convention, security, custom.
  - **Skill body\*** — the body editor.
- Body editor: a bordered box. Its header row shows a `FileText` icon,
  `<name>.md`, an `unsaved` badge when the form differs from the saved skill,
  and on the right the token count. The body is a monospace textarea with a
  line-number gutter that scrolls with it.
- Token count:
  - no unsaved edits and `token_count` present: `166 tokens`;
  - unsaved body edits, or `token_count` missing: `≈ N tokens`, where
    `N = ceil(body.length / 4)`.
- Footer: **Discard** (resets the form) and **Save** (primary). Save is enabled
  only when the form is dirty, Name and Body are non-empty after trimming.
- Save opens a small `Modal` "Save as v{N+1}" with an optional **Change note**
  input and **Save**. It sends `PATCH /skills/:id` with the changed fields and
  `note`. On success the form resets to the returned skill, the badges show the
  new version, and the list and Versions refresh. On error the modal stays
  open and shows the message inline (`errorUi: "inline"`).
- A **Delete skill** danger button at the bottom opens `ConfirmDialog`: "Delete
  {name}? It is detached from {n} agents." Confirm calls `DELETE` and goes to
  `/skills`.
- For a skill whose source is `community` or `imported_file`, a warning
  notice above the fields repeats the trust warning (see Import).
- The draft lives in the detail pane, keyed by skill id, so switching tabs of
  the same skill keeps it. Opening another skill, or leaving `/skills`, with
  unsaved edits first asks for confirmation (`ConfirmDialog`: "Discard unsaved
  changes?"); confirming drops the draft.

### Preview tab (design 5)

- Title **Preview**, subtitle "Rendered as the reviewing agent receives it."
- A card renders the block exactly as the model receives it: `### {name}`, the
  italic description, then the body, with the kit's `Markdown` primitive
  (react-markdown + remark-gfm, safe URL transform). It renders the draft when there are unsaved
  edits, with the `unsaved` badge beside the title; otherwise the saved body.
- Empty body: "This skill has no body yet."

### Versions tab (design 8)

- Title **Version history** with a badge `{n} versions`; subtitle "Every save
  snapshots the skill so eval runs stay reproducible against the exact text
  they scored."
- One row per version, newest first: a `vN` chip (accent for the current one),
  the note (or "No note" muted), and the date (`YYYY-MM-DD`).
  - The current version (`version === skill.version`) shows a green
    `● Current` badge.
  - Every other row shows **Diff** (`Eye`) and **Restore** (`History`).
- **Diff** opens a `Modal` "v{old} → v{current}". It loads the old version with
  `GET /skills/:id/versions/:v` on open. Changed name, description and type
  are listed as `old → new` rows; the body is shown as a line diff of the old
  body against the current saved body, rendered with the shared `DiffViewer`
  as one file `<name>.md`. Identical bodies show "Body unchanged".
- **Restore** opens `ConfirmDialog`: "Restore v{v}? This creates v{current+1}
  with the content of v{v}. History is kept." Confirm calls
  `POST /skills/:id/versions/:v/restore`; on success the new row appears as
  Current with the note "Restored from v{v}", and the Config form resets.
- Restore is disabled while Config has unsaved edits (title: "Save or discard
  your edits first").
- Loading: three skeleton rows. A skill with one version shows just that row.

### Context, Evals, Stats tabs (M2)

- Each shows an `EmptyState`: Context "Project context for skills arrives in
  M5", Evals "Skill eval cases arrive in M6", Stats "Skill usage stats arrive
  in M7". No request is sent.

### Create skill

- **Create skill** opens `CreateSkillModal` with Name\*, Description (with the
  directive hint), Type (default `custom`) and Body\* (the body editor). Create
  sends `POST /skills`; on success it navigates to `/skills/{id}?tab=config`.
  A server error (for example a duplicate name) is shown inline.

### Import skill

- **Import from file** opens `ImportSkillModal`, two steps.
- Step 1 — pick: a file input accepting `.md,.zip` and a line "Only Markdown is
  read. Scripts and other files in an archive are listed and ignored." A file
  over 1 MB or with another extension is rejected in the client with a
  message, before any request. Otherwise the file is read as base64 and sent
  to `POST /skills/import/preview {filename, content_base64}`. A loading state
  replaces the picker. Errors show inline and keep step 1.
- Step 2 — preview:
  - the trust warning, a warn-coloured box with `AlertTriangle`: "This skill's
    text goes into your agents' prompts as instructions. Read it before you
    save: a skill from someone else is someone else's instructions to your
    reviewer.";
  - `Imported from {source_file}`;
  - editable Name, Description, Type and Body, prefilled from the preview;
  - **Skipped files ({n})** — each `path` with its size (`2.1 KB`), shown only
    when the list is non-empty; and each server `warnings[]` string;
  - an **Enable after import** checkbox, off by default.
- **Save skill** sends `POST /skills/import` (the server saves it with
  `source = 'imported_file'`) with the edited fields and `enabled`, then
  navigates to the new skill. **Back** returns to step 1; **Cancel** or closing
  the modal sends nothing more. The preview call itself stores nothing.

### Agent editor — Skills tab (design 1)

- `/agents/[id]` accepts `?tab=skills`; `TABS` gets `skills` after `config`.
- `AgentCard` shows `✦ N skills` from `Agent.skill_count`.
- Header: **Skills**, a badge `{enabled} of {linked} enabled` (links whose
  checkbox is on, over linked skills), and a **Filter skills…** input on the
  right. Below: "Order matters — earlier skills appear earlier in the assembled
  prompt. Drag to reorder."
- One row per linked skill, in link order: a drag handle (`Menu` icon, ≡), a
  `Checkbox` (the link's `enabled`), the name in mono, a muted `off globally`
  badge when the skill itself is disabled, the type badge on the right, and a
  **Detach** icon button (`X`).
- A skill enters the prompt only when it is linked, its checkbox is on and the
  skill is enabled globally. A row with `off globally` keeps its checkbox and
  gets the title "Disabled on the Skills page — it will not load".
- **Attach skill** (`Plus`, a `Dropdown` under the list) lists the workspace
  skills not yet linked; picking one appends it, enabled.
- Reorder: native HTML5 drag on the row by its handle; the handle is also a
  button, and `Alt+↑` / `Alt+↓` on it move the row one place. Reorder is off
  while the filter is non-empty (the handle is dimmed).
- Every change (check, reorder, attach, detach) saves at once with
  `POST /agents/:id/skills` and the full ordered list `{skill_id, enabled}[]`.
  The list updates optimistically and rolls back on error (global toast).
- No links: "No skills attached" with the Attach control. No workspace skills:
  a link to `/skills`.

### Run trace drawer

- The `Skills / rules` block in Prompt assembly shows, next to its label,
  `+{skills_tokens} tokens` and the loaded skills as chips
  `pr-quality-rubric v5`, in order, from `skills_used`.
- A trace without `skills_tokens` (stored before M2) shows the block as today.

## Changes

- Routes:
  - `src/app/skills/page.tsx`, `src/app/skills/[id]/page.tsx` (thin), with
    `src/app/skills/constants.ts` (`VALID_TABS`, `DEFAULT_TAB`, type → colour
    and source → icon/key maps, `MAX_IMPORT_BYTES = 1_048_576`,
    `IMPORT_ACCEPT`) and `helpers.ts`. The 1 MB limit is on the raw file; the
    server's preview route allows 1.5 MB for the base64-encoded body.
  - `src/app/agents/[id]/page.tsx`: `VALID_TABS` gains `skills` (move it to the
    route's `constants.ts` while editing it).
- Components (under `src/app/skills/_components/`):
  - `SkillsLayout/` — left column + right slot, used by both pages.
  - `SkillCard/`, `SkillDetail/` (header, tabs, draft state),
    `SkillDetail/_components/{ConfigTab, PreviewTab, VersionsTab,
    FutureTabEmpty, SaveNoteModal, VersionDiffModal}`.
  - `SkillBodyEditor/` — textarea + line gutter; used by Config, Create and
    Import, so it lives at the route level.
  - `CreateSkillModal/`, `ImportSkillModal/`.
  - Agent side: `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`.
  - Trace: `RunTraceDrawer/_components/PromptBlock` gets an optional `meta`
    slot; `TraceBody` passes the token chip and skill chips.
  - Pure helpers (with `helpers.test.ts`): `filterSkills`, `estimateTokens`,
    `isDirty`, `tokenLabel` (returns key + values), `lineDiffToPatch(old, new)`
    — a small LCS line diff that emits a unified patch for `DiffViewer`,
    `moveItem(list, from, to)`, `toLinkPayload`, `countEnabledLinks`,
    `formatBytes`.
  - `@devdigest/ui`: `nav.ts` gets the `SKILLS LAB` group and the `g s`
    shortcut — a deliberate vendor change. No new kit component.
- Hooks: `src/lib/hooks/skills.ts`
  - `useSkills` GET `/skills`; `useSkill(id)` GET `/skills/:id`;
    `useCreateSkill` POST `/skills`; `useUpdateSkill` PATCH `/skills/:id`;
    `useSetSkillEnabled` PATCH `/skills/:id/enabled`; `useDeleteSkill` DELETE;
    `useSkillVersions(id)`; `useSkillVersion(id, v)` (pass `null` until the
    modal opens); `useRestoreSkillVersion` POST `…/versions/:v/restore`;
    `useImportSkillPreview` POST `/skills/import/preview`; `useImportSkill`
    POST `/skills/import`.
  - In `agents.ts`: `useAgentSkills(agentId)` GET, `useSetAgentSkills` POST
    `/agents/:id/skills` (optimistic, invalidates `agentSkills`, `agents`,
    `skills`).
  - `query-keys.ts`: `skills()`, `skill(id)`, `skillVersions(id)`,
    `skillVersion(id, v)`, `agentSkills(agentId)`.
  - Save, create, import-preview and restore set `meta: { errorUi: "inline" }`.
- Strings:
  - `messages/en/skills.json` rewritten: `page.*`, `card.*`, `detail.*`,
    `tabs.*`, `config.*`, `preview.*`, `versions.*`, `future.*`, `create.*`,
    `import.*`; the URL/community/"untrusted data" keys removed.
  - `messages/en/agents.json`: `skills.orderHint` ends with "Drag to reorder.";
    add `skills.attach`, `skills.detach`, `skills.offGlobally`, `skills.empty`.
  - `messages/en/runs.json`: `trace.prompt.skillsTokens`.
  - `messages/en/shell.json`: nav labels if the sidebar reads them there.
- Contracts (`@devdigest/shared`, client copy, matching the server copy):
  `Skill` (+`agent_count`, `token_count?`, `created_at`, `updated_at`; source
  enum + `imported_file`), `SkillInput`, `SkillUpdate`, `SkillVersion`,
  `SkillImportPreview`, `AgentSkillLink` (+`enabled`, `name`, `type`),
  `PromptAssembly` (+`skills_tokens`, `skills_used`), `Agent` (+`skill_count`).

## Acceptance criteria

- [ ] The sidebar shows `SKILLS LAB` with Skills and Agents; `/skills` highlights Skills.
- [ ] Each card shows icon, name, toggle, description, type badge, source label and `N agents`; no pull % or accept %.
- [ ] A disabled skill's card is dimmed; toggling it sends `PATCH /skills/:id/enabled` and does not navigate.
- [ ] Search narrows the cards by name or description without a request.
- [ ] `/skills/[id]` shows six tabs; `?tab=` selects one and an unknown value falls back to Config.
- [ ] Context, Evals and Stats show an empty state naming M5, M6 and M7.
- [ ] "Run on evals" is disabled and its hover text names M6.
- [ ] Config shows the directive hint under Description.
- [ ] Editing any field shows `unsaved`; reverting it hides the badge.
- [ ] The token count shows the server value when clean and `≈ ceil(chars/4)` while the body is edited.
- [ ] Save asks for an optional note and sends `PATCH /skills/:id` with it; the version badge then shows `v{N+1}`.
- [ ] Save is disabled with an empty name or body.
- [ ] Preview renders the body as Markdown, including unsaved edits.
- [ ] Versions lists every version newest first; only the current one has `Current`, the others Diff and Restore.
- [ ] Diff shows a line diff of the chosen version against the current body.
- [ ] Restore asks for confirmation and, on confirm, a new current version appears with "Restored from vN".
- [ ] Import accepts `.md` and `.zip` only, rejects files over 1 MB before sending, and shows a preview with the trust warning and the skipped files.
- [ ] Nothing is created until **Save skill** is clicked; Cancel at step 2 sends no `POST /skills/import`.
- [ ] The agent Skills tab shows `{enabled} of {linked} enabled`, the order hint, and rows with handle, checkbox, mono name and type badge.
- [ ] Checking, reordering (drag or `Alt+↑/↓`), attaching or detaching sends `POST /agents/:id/skills` with the full ordered `{skill_id, enabled}[]`.
- [ ] A globally disabled skill's row shows `off globally`.
- [ ] `AgentCard` shows the agent's skill count.
- [ ] The trace's skills block shows `+T tokens` and `name vN` chips in prompt order.
- [ ] All new text comes from `messages/en`.

## Tests

- `src/app/skills/helpers.test.ts` (and per-folder `helpers.test.ts`):
  `estimateTokens` rounding; `isDirty` per field; `filterSkills`;
  `lineDiffToPatch` on an add, a delete, and identical text; `moveItem` at the
  ends; `toLinkPayload` keeps order and `enabled`; `formatBytes`.
- `SkillCard.test.tsx`: renders `3 agents` and no pull/accept; toggle calls the
  mutation and does not navigate; a disabled skill is dimmed.
- `ConfigTab.test.tsx`: typing shows `unsaved` and `≈` tokens; Save opens the
  note modal and sends the note in the PATCH body; empty name disables Save.
- `VersionsTab.test.tsx`: only the current row has `Current`; Restore confirms
  and posts to the restore route.
- `ImportSkillModal.test.tsx`: a `.zip` preview lists skipped files and the
  trust warning; no `POST /skills/import` before Save; Cancel at step 2 sends none;
  a 2 MB file is rejected without a request.
- `SkillsTab.test.tsx`: unchecking a row and moving a row with `Alt+↓` each
  post the expected ordered payload; an `off globally` skill shows the badge.
- `RunTraceDrawer.test.tsx`: a trace with `skills_tokens` and `skills_used`
  shows `+T tokens` and `name vN`; an old trace still renders.
- `AgentEditor.test.tsx`: `?tab=skills` renders the Skills tab.
- `CreateSkillModal.test.tsx`: fill and Create posts `POST /skills` and hands
  the new id to `onCreated`; a 400 shows `role=alert` and keeps the modal open.
- e2e `08-skills.flow.json` (new, read-only on seeded data per
  `e2e/AGENTS.md`): open `/skills` → open seeded `pr-quality-rubric` →
  Config shows `v5` → Preview renders the block → Versions shows the v5 note
  ("Tightened scope rule…") and the v1 note; open the seeded Security
  Reviewer's Skills tab → `3 of 6 enabled`. Creating, saving and attaching
  are covered by the component tests, not e2e. `03-agents.flow.json` is
  unchanged. Needs the server seed from the server spec.

## Future tabs

Designs recorded so later milestones keep the layout; none of this is built in M2.

- **Context (M5, design 4)** — title "Project context to use" with a badge
  `{n} attached` and a "Filter documents…" input. Subtitle "Any agent using
  this skill inherits these documents." Rows: drag handle, checkbox, file name
  in mono, folder (`specs/`, `docs/`, `insights/`) muted, a folder-type badge
  (specs accent, docs green, insights amber) and an eye button to preview.
  Below, "SERIALIZES AS" and a mono box with the generated section
  (`## Project specifications` / `- specs/public-api.md`).
- **Evals (M6, design 6)** — title "Eval cases" with a `{passing} / {total}
  passing` badge (amber when not all pass); **Run all evals** and **New eval
  case** on the right. Rows: a pass/fail/never-run status icon, the case name
  in mono, a `MUST FIND` (accent) or `MUST NOT FLAG` (muted) badge, a line
  "expected N finding(s), got M" or "never run", a right-aligned expectation
  chip (`CRITICAL · security`, `assert empty`), and run, edit, delete icons.
  Spec: `M6-eval-dashboard.md`. The header's **Run on evals** is enabled then.
- **Stats (M7, design 7)** — four metric cards: USED BY `3 agents`, PULL
  FREQUENCY `71%`, ACCEPT RATE `74%` with a small ring, FINDINGS (30D) `96`.
  Then "AGENTS USING THIS SKILL" (rows with agent name and **Open**) and
  "FINDINGS BY CATEGORY" (donut with a legend per category). The card's pull %
  and accept % slots return in M7 with the same numbers.
- **Agent editor** (design 1) — Evals, Stats and CI tabs and the card's runs /
  accept / avg cost line belong to their own milestones.

## Related specs

- [`../../server/specs/M2-skills.md`](../../server/specs/M2-skills.md) — routes, versions, import parser, executor wiring, seed.
- [`../../reviewer-core/specs/M2-skills.md`](../../reviewer-core/specs/M2-skills.md) — `formatSkills` and the skills block in the prompt.
- [`M6-eval-dashboard.md`](M6-eval-dashboard.md) — the Evals tab and "Run on evals".

## Decisions (approved 2026-11-28)

- Design 1 lists every workspace skill; this spec keeps linked skills only, with
  a per-link checkbox and Attach/Detach (user decision).
- A checked link whose skill is disabled globally (`skill_enabled: false`) shows
  a muted "disabled globally" tag and does not count toward "N of M enabled".
- `@devdigest/ui` `Toggle` gains an optional `aria-label` prop (a deliberate,
  minimal vendor change); every skill toggle passes one.
- Diff and reorder use no new dependency: a local LCS line diff, and native
  HTML5 drag plus `Alt+↑/↓`.
- Preview renders the block exactly as the model receives it: the `### name`
  heading and the italic description above the body.
- Leaving a skill with unsaved edits (switching skill, tab or route) asks for
  confirmation with `ConfirmDialog`.

## Open questions

- None.
