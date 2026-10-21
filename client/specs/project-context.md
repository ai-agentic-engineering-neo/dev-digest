# Project context — client

Browse the Markdown documents of a repository, attach them by hand to an agent
or a skill, and see in the run drawer exactly which ones went into the prompt.
The API, data model and run behaviour are in
[`server/specs/project-context.md`](../../server/specs/project-context.md).

Spec: specs/project-context.md (SPEC-01)

Status: **implemented 2026-10-20**; editing a document and saving a local
override (AC-45 to AC-69) **implemented 2026-10-21**.

## Surfaces

| # | Where | Hooks | What |
|---|---|---|---|
| 1 | `/context` (`ProjectContextView`) | `useContextFiles`, `useContextFile`, `useSaveContextFile`, `useResetContextFile` | the sidebar's active repository (no selector or Refresh of its own), count, one `ContextDocumentRow` per document (path, kind tag, `≈ N tokens`, «used by N agents / M skills», «too large» badge, a marker when modified locally) and the selected document with **Preview / Edit** pills: Preview renders the effective text with `Markdown`, Edit is a textarea whose Save stores a local override (the repository is never written) |
| 2 | `/agents/[id]?tab=context` (`ContextTab` → `ContextAttachPanel`) | `useContextFiles`, `useContextAttachments('agent', …)`, `useSetContextAttachments('agent')` | title with the «N of M attached» badge and the filter box on the same row; repo selector (several repos only); rows with drag handle, checkbox, file name + folder (two cells), tokens, kind badge coloured by kind, an eye icon (**Preview**), ↑/↓ for attached rows; total tokens footer; a changed list creates a new agent version |
| 3 | `/skills?skill=<id>&tab=context` (was `/skills/[id]?tab=context`) (`ContextTab` → `ContextAttachPanel`) | the same with `'skill'` | title «Project context to use», badge «N attached», hint that agents using the skill inherit the documents, and a read-only `<pre>` block («Serialised block») `## Project context` + one path line per attached document; the skill body and version are not touched |
| 4 | Sidebar | — | **Project Context** under WORKSPACE, directly below Pull Requests (`vendor/ui/nav.ts`, `href: "/context"`, no `g` shortcut; the approved design-system exception) |
| 5 | Run trace drawer → Configuration, Prompt assembly | — | see Run drawer below |

Token counts are approximate and every one is labelled with `≈`.

## `/context`

- Params: `?doc=<path>` (selected document), written with `router.replace` so
  it survives a reload. The page wraps the view in `Suspense` because it reads
  `useSearchParams`.
- Repository: always the shell's active repository (`useActiveRepo`: URL, then
  localStorage, then the first); the page has no selector of its own. Picking
  another repository in the sidebar while on `/context` keeps the page open
  (`useShellContext.onSelectRepo` replaces the URL with `/context`, dropping
  `?doc=`) and the list reloads for the new repository; on every other page
  the sidebar pick still navigates to that repository's pull requests.
- Layout (design "Project Context (N6)", applied 2026-10-21): no page title
  (the breadcrumb names the page); a two-pane frame filling the shell's main
  area. `ProjectContextView` keeps the state and wiring and renders two pure
  views from its `_components/`: `FilePanel` on the left and `DocPane` on the
  right.
- `FilePanel` (272 px, `role=list` «Documents»): the section label «Project
  context», the folder every listed path shares (`commonFolder`, e.g.
  `docs/agent-prompts/`; empty when the paths share none), the toolbar, one
  compact row per document (`FileText` icon + the name relative to the shared
  folder via `displayName`, `aria-pressed` on the selected row, the full path
  as tooltip, a «Modified locally» dot and a «too large» badge where
  applicable; no kind tag, token count or usage on rows) and a footer «N
  documents · ≈ M tokens». While loading the rows are skeletons; the toolbar
  and footer hide when the repository cannot be listed.
- Toolbar (`role=toolbar` «Document tools»): **Add document**, **New folder**
  and **Upload document** are the design's icons with no backend yet,
  rendered disabled (wrapper `aria-disabled`, «Not available yet» tooltip);
  **Refresh the list** calls `useRefreshContext`
  (`GET /repos/:id/context?refresh=true`) and writes the result into the
  `["context", repoId]` cache. There is no other refresh control.
- `DocPane`: a header row (document name relative to the shared folder, the
  «Modified locally» badge (`ModifiedLocallyBadge`, last save time as tooltip)
  when the file read has `modified`, a pill group (`role=group` «Document
  view», two `aria-pressed` buttons) switching **Preview** (rendered
  `Markdown` of the effective text) and **Edit** (see Editing below); on the
  right the token badge, «Used by N agents» (`SpecFile.agents_using`: enabled
  agents that receive the document at run time, directly or through an
  enabled skill) and a `CircularScore` **Coverage** ring = `agents_using /
  enabled agents` from `useAgents` (0 when there is no enabled agent; the
  accessible name reads «N of M enabled agents use this document»)) over a
  borderless scrolling body. The mode resets to Preview, with no draft, when
  another document is opened. «Select a document» fills the pane before a
  selection; a preview error shows Retry.
- Repository-level states replace the pane while the panel stays: «No
  repository yet»; **error state with Retry** «Repository not cloned» when
  the repo row has no clone or the API answers 409 (no document request is
  sent without a clone); «Couldn’t load the documents» with Retry on any
  other failure (including the 502 below); «No documents found» naming the
  discovery roots (`specs, docs, insights`).
- A repo whose stored default branch is absent from the clone gets the generic
  load error (the API answers 502 `listFiles: ref not found`).

## Editing a document (`/context`)

- Edit pill: `DocEditor` (`ProjectContextView/_components/DocEditor`) shows a
  design-system `Textarea` (monospace, 18 rows) labelled «Document text» (the
  label is visually hidden) over the effective text. The draft state lives in
  `ProjectContextView`; `DocEditor` is a pure view.
- **Save** is enabled only while the draft differs from the effective text and
  is within 200,000 characters (`canSaveDraft`, `PROJECT_CONTEXT_FILE_MAX_CHARS`
  mirrored in `src/lib/project-context.ts`) and no save is in flight. While
  the draft is over the cap a `role=status` counter «N / 200,000 characters —
  the text is over the limit…» shows and Save stays disabled.
- Ctrl/Cmd+S (`hooks/useSaveShortcut.ts`) runs the same save and calls
  `preventDefault` on the keydown, but only while the page is in Edit mode, the
  document is not `too_large` and its text has loaded. Outside Edit mode the
  browser's own handling is untouched; with an unchanged text nothing is sent.
- Save sends one `PUT /repos/:id/context/file` through `useSaveContextFile`. On
  success the file cache takes the server's answer, the `["context", repoId]`
  listing refetches (row marker, tokens), the draft clears, the page stays in
  Edit mode and the toast «Saved as a local override» shows. On failure the
  global mutation toast reports the error, the draft stays in the textarea and
  the document is unchanged.
- **Reset to repository version** is a ghost button under the head row, shown
  only while the file read has `modified`. It opens a `ConfirmDialog`
  («Reset to the repository version?»); Reset sends
  `DELETE /repos/:id/context/file?path=` through `useResetContextFile`, clears
  the draft, drops the badge and the row marker and toasts «Back to the
  repository version».
- **Modified locally** shows as the badge next to the opened path and as a dot
  on the document's list row (`ContextDocumentRow` `modified`, `role=img` with
  the accessible name «Modified locally»). Both disappear after a reset or after
  a save of text identical to the repository text (the API answers
  `modified: false`).
- **Unsaved-changes guards.** The page is dirty while it is in Edit mode and the
  draft differs from the effective text. While dirty, a request to select
  another document, to switch Edit → Preview, or to change the sidebar
  repository opens a `ConfirmDialog` «Discard unsaved changes?» with Cancel and
  Discard only (no «Save and continue»). Cancel keeps everything as it was;
  Discard clears the draft and runs the held action. The sidebar case goes
  through `repo-context.tsx`: `useShellContext.onSelectRepo` calls
  `requestRepoChange(id, proceed)`, which runs `proceed` at once or hands it to
  the single guard the page registered with `useRepoChangeGuard` (registered
  only while dirty, dropped on unmount); the repository switch happens only
  after Discard. A browser reload or tab close is not guarded.
- **A `too_large` document** (`SpecFile.too_large`): no text is requested (the
  API answers 422), the head row still shows the path and the pills, and both
  the Preview and the Edit pill show the notice «This document is larger than
  200,000 characters and cannot be opened or edited.» instead of text or a
  textarea.
- Preview of a modified document renders the override text; the agent and skill
  Context tabs' Preview modal shows the same effective text with the same badge.

## Context tab (`src/components/context-attach-panel`)

- One shared panel for both editors; `owner = { kind: 'agent' | 'skill', id, name }`.
  The wrappers are `agents/[id]/_components/AgentEditor/_components/ContextTab`
  and `skills/[id]/_components/SkillEditor/_components/ContextTab`; the agent
  page accepts `context` in `VALID_TABS`.
- Rows: attached documents first in stored order (a path that left the listing
  stays, flagged «missing», so it can be unchecked), then the other documents by
  path (`mergeRows`). The filter matches path or kind; while it is active drag
  is off.
- Every change (check, uncheck, drag, ↑/↓) saves at once through
  `useSetContextAttachments`: the `["context-attachments", kind, id, repoId]`
  cache is written optimistically and rolled back when the `PUT` fails; the
  global mutation toast reports the error and the panel shows a «Context saved»
  toast on success. For an agent the `["agent", id]`, `["agents"]` and
  `["context", repoId]` queries are refreshed; for a skill only the listing.
- Badges: «missing» and «too large» rows stay visible. A too-large document has
  an inert checkbox until it is already checked (then it can be unchecked).
- Warning: while the summed `tokens` of the checked, listed documents are above
  24,000 (`PROJECT_CONTEXT_RUN_MAX_TOKENS`, mirrored in `src/lib/project-context.ts`),
  a `role="alert"` line names the total and the cap and says later documents
  will be skipped at run time. It does not block saving.
- Preview opens `ContextDocPreview` (a modal over `useContextFile` rendered
  with `Markdown`) of the effective text, with the «Modified locally» badge next
  to the path when the document has an override. Paths are rendered as text,
  never as HTML. The rows carry the same modified marker.
- States: skeleton; «No repository yet»; «not cloned» empty state; error state
  with retry; «No documents found»; «No document matches».

## Run drawer (`TraceBody`)

- When `prompt_assembly.context_blocks` is non-empty: the block «Project
  context — attached specs (untrusted)» with `context_tokens`, showing
  `prompt_assembly.specs`, then one collapsible `PromptBlock` per document
  labelled `↳ path · N tokens · source` plus `· truncated` where it applies,
  each opening to the full text sent. A sub-block whose `modified` is exactly
  `true` also reads `· Modified locally`; with `modified` false, absent or null
  (traces written before the increment) there is no such label. This block
  replaces the generic `specs` block.
- Configuration → Specs read: each `specs_read` entry that has a
  `context_blocks` entry shows `path · N tokens`; intent refs are shown as
  before.
- Without `context_blocks`: no Project context sub-blocks, the generic `specs`
  block shows if present, and Specs read lists the intent refs or «none».

## Components and files

| Piece | Path |
|---|---|
| hooks | `src/lib/hooks/project-context.ts` (`useContextFiles`, `useRefreshContext`, `useContextFile`, `useSaveContextFile`, `useResetContextFile`, `useContextAttachments(kind, id, repoId)`, `useSetContextAttachments(kind)`); the stale `useContextFiles` / `useReindexContext` in `hooks/core.ts` were removed |
| domain helpers | `src/lib/project-context.ts` (mirrored caps and kinds, `defaultContextRepoId`, `sumCheckedTokens`, `isOverPromptCap`, `serializeContextBlock`, `isOverFileCap`, `canSaveDraft`) |
| route | `src/app/context/page.tsx` → `_components/ProjectContextView` (+ `_components/DocEditor`, `hooks/useSaveShortcut.ts`) |
| repo-change guard | `src/lib/repo-context.tsx` (`requestRepoChange`, `registerRepoGuard`, `useRepoChangeGuard`, type `RepoChangeGuard`); call site `components/app-shell/hooks/useShellContext.ts` |
| cross-page components | `src/components/context-attach-panel`, `context-document-row`, `context-doc-preview`, `token-badge`, `modified-locally-badge`; all five are in `/showcase` (the document row in attached, missing, too-large and modified states) |
| strings | `messages/en/context.json` (page, row, panel), `agents.json` / `skills.json` (`context.*`), `runs.json` (`trace.prompt.context*`) |

## Tests and e2e

| File | Covers |
|---|---|
| `src/app/context/_components/ProjectContextView/ProjectContextView.test.tsx` | file panel rows and footer, preview with the token badge, follows the shell's repo (no selector, no header refresh), empty, error and not-cloned states; Edit textarea, one `PUT`, toast, stay in Edit, failure keeps the text, Ctrl/Cmd+S (default prevented in Edit only), badge and row marker, Reset confirm then `DELETE`, the three unsaved-changes guards, the too-large notice in both pills |
| `src/app/context/_components/ProjectContextView/_components/DocEditor/DocEditor.test.tsx` | label, Save enabled only when changed and under the cap, counter |
| `src/components/context-attach-panel/ContextAttachPanel.test.tsx` | rows, save, rollback, cap warning, badges, skill variant, the badge in the Preview modal |
| `src/lib/hooks/project-context.test.ts` | optimistic write and rollback |
| `src/lib/project-context.test.ts` | repo default, token sum, block serialisation, `canSaveDraft` |
| `src/lib/repo-context.test.tsx` | `requestRepoChange` runs `proceed` at once without a guard and hands it to the registered guard |
| `AgentEditor.test.tsx`, `RunTraceDrawer.test.tsx`, `src/test/smoke.test.tsx` | the tab renders, drawer blocks and the «Modified locally» label (true, false, null), the showcase group |
| `e2e/specs/14-project-context.flow.json` | sidebar → `/context` shows the not-cloned error state with Retry for the seeded repo; the seeded agent's Context tab shows the same state |

## Known limits

- No automatic selection of documents; attachment is manual.
- Existing documents can be edited and reset; create, upload and delete of
  documents are not available (their toolbar icons stay disabled).
- An override is local to this installation and per repository and path; there
  is no history, no diff against the repository text and no warning when the
  repository text changes after an edit.
- Two browser tabs editing one document: the last save wins; the other tab
  shows older text until its queries refetch.
- The unsaved-changes guards cover in-app navigation only (document, mode,
  sidebar repository), not a reload or a closed tab.
- The skill editor tab order is Config, Preview, Context, Versioning.
