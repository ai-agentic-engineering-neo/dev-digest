# Spec: Project Context — editable DevDigest docs   |   Spec ID: SPEC-03   |   Status: approved
Modules: server · client
Supersedes: specs/project-context-folder.md (SPEC-01) — the Non-goal "Creating, editing, uploading or deleting
docs in the app", the Design-review decision "Read-only from the repo", and the page presentation of SPEC-01
AC-2/AC-4/AC-5 (layout, list, empty and not-cloned states), SPEC-01 AC-1 discovery for paths under `.devdigest/`
(AC-4), and SPEC-01's "no section while the repo is not synced" for `.devdigest` docs (AC-11). The rest of
discovery, attachments, the cap and injection rules of SPEC-01 stay in force. Sibling spec: [project-context-agent-tab-and-trace.md](project-context-agent-tab-and-trace.md) (SPEC-04).

## Problem and why

SPEC-01 shows a repo's docs read-only: to give an agent a rule the repo doesn't have yet (a team note, a review
checklist, a tweaked copy of a spec), the user must commit it to the repo and resync. Design N6 has an editable
`.devdigest/specs/` folder for exactly this. The current page is also a narrow centred column with a flat list of
~100 full paths and unstyled markdown, far from the N6 layout. Users need a place to write their own context docs
inside DevDigest, next to the repo's docs, in a page that is readable at that size.

## Goals / Non-goals

Goals
- DevDigest-owned docs per repo under `.devdigest/specs/`: New file, New folder, Upload, Edit, Save, Delete.
- Repo docs stay read-only, with "Copy to .devdigest/ to edit".
- `.devdigest` docs attach to agents and reach runs exactly like repo docs.
- The Project Context page matches N6: full-height two-panel layout, grouped doc tree, typographic preview.

Non-goals
- Writing anything into the repository, its clone, or GitHub (no commits, no PRs). DevDigest docs never leave DevDigest.
- Editing repo docs in place.
- The N6 "COVERAGE" score and chunk counts ("1,240 chunks"); retrieval/embeddings of docs.
- Attaching docs to skills (design N2c) — SPEC-05.
- Renaming or moving files and folders; version history of a DevDigest doc; concurrent-edit warnings
  (local-first, single-user: the last save wins, as in SPEC-01).
- Agent Context tab and run-trace presentation — SPEC-04.
- `.devdigest` docs as an input to the Onboarding Tour (SPEC-02) — revisit when SPEC-02 is planned.

## User stories

- As a reviewer-agent owner, I write `.devdigest/specs/review-checklist.md` in DevDigest and attach it to my
  agent, without touching the repo.
- As a team member, I copy the repo's `specs/security-baseline.md`, tighten one rule in my copy and attach
  the copy instead of the original.
- As a user with ~100 docs, I find a doc by source and folder instead of scanning full paths.

## Acceptance criteria (EARS)

- **AC-1** WHEN the user opens the Project Context page, the system SHALL show the breadcrumb
  "<repo> › Project Context" and a two-panel layout filling the viewport height and the full width of the
  content area, like the Pull Requests page (no centered page column, no page title block): the left panel sits
  flush against the app sidebar with a fixed width, and the right panel takes all remaining width:
  - left: the title "PROJECT CONTEXT", a toolbar (New file, New folder, Upload, Resync — each with an accessible
    name and tooltip), the filter, the doc tree (AC-2), and a footer with the number of docs and the repo's last
    sync time ("not synced" when never synced);
  - right: the selected doc's file name, a Preview | Edit switch, its source label, token estimate and
    "Used by N agents"; with nothing selected, a hint to select a doc.
- **AC-2** The doc tree SHALL group docs into collapsible sections in this order, hiding empty ones:
  ".devdigest (editable)", Specs, Docs, Insights, READMEs. Inside a section, docs form a flat list (user decision
  2026-11-08, matching the N6 screenshot): a doc row shows a file icon, its file name, an area chip from the first
  path segment (CLIENT, SERVER, E2E, REVIEWER-CORE, DOCS, ROOT), its folder in a muted line below (none for root
  files) and its token estimate, with the full path in its tooltip and accessible name. `.devdigest` folders are
  shown as selectable folder rows (targets for New file / Upload). WHEN the user types in the filter, the list
  SHALL show only docs matching the SPEC-01 AC-3 rule, with their sections expanded. Expanded/collapsed state SHALL survive a page reload in the same browser.
- **AC-3** WHEN a doc is shown in Preview, the system SHALL render its markdown with the N6 typography: three
  visually distinct heading levels, bulleted and numbered lists with markers and indentation, inline code in a
  monospace face on a code background, fenced code blocks, emphasis, links and paragraph spacing. Raw HTML is
  shown as text, never executed.
- **AC-4** The system SHALL keep `.devdigest` docs per repo inside DevDigest, list them under paths starting with
  `.devdigest/specs/` with the source label `devdigest`, and never write them into the repo or its clone. They
  SHALL survive a Resync. DevDigest owns the `.devdigest/` namespace: files the repo itself has under `.devdigest/`
  SHALL NOT be discovered as repo docs, and WHILE the repo has any, the page SHALL note that they are ignored. WHILE the repo is not cloned, the page SHALL still list, preview, create, edit and
  delete `.devdigest` docs, with the SPEC-01 "not cloned" notice and Resync action in place of the repo docs.
- **AC-5** WHEN the user creates a file (New file, entering a name that may include folders, e.g. `auth/login.md`)
  in the selected folder, the system SHALL create an empty `.devdigest` doc, select it and open it in Edit; a name
  without the `.md` extension gets `.md` appended. New folder SHALL add an empty folder node that becomes the target of the next New file or Upload; a folder
  with no files is not stored and is gone after a reload. IF the name is empty, contains `..`, `\`, a leading
  `/` or a line break, exceeds the path-length limit of repo docs, equals an existing `.devdigest` path, or the
  repo already has 200 `.devdigest` docs, THEN the system SHALL show the reason inline and create nothing.
- **AC-6** WHILE a `.devdigest` doc is in Edit, the system SHALL show its markdown source in an editor; Preview
  SHALL render the current (unsaved) text. WHEN the user clicks Save, the system SHALL store the content,
  update the token estimate, and disable Save until the next change. Saved content SHALL be used from the next
  run of every agent that has the doc attached; runs already started keep what they read.
  IF the save fails or the content exceeds 1 MB, THEN the system SHALL keep the edits in the editor and show the reason.
- **AC-7** IF the user selects another doc, leaves the page or reloads it while a `.devdigest` doc has unsaved
  changes, THEN the system SHALL ask for confirmation before discarding them.
- **AC-8** WHEN the user uploads one or more files, the system SHALL add each UTF-8 text file with extension
  `.md` and size ≤ 1 MB as a `.devdigest` doc in the selected folder (or `.devdigest/specs/`), and SHALL list
  every rejected file with its reason (not `.md`, over 1 MB, not text, invalid name, over the 200-doc limit).
  Accepted files are added even when others are rejected. IF an uploaded file's name equals an existing
  `.devdigest` doc in that folder, THEN the system SHALL ask "Overwrite / Cancel" for that file and SHALL neither
  overwrite silently nor rename it.
- **AC-9** WHILE a repo doc is selected, the system SHALL offer no Edit or Delete and SHALL show
  "Copy to .devdigest/ to edit". WHEN the user clicks it, the system SHALL create a `.devdigest` doc with the
  repo doc's content at the last synced commit, select it in Edit, and show "Copied from <repo path>" in its
  header. IF that copy already exists, THEN the system SHALL open the existing copy unchanged with a
  "copy already exists" notice. Attachments of the original are not changed. The copy's path is the repo path
  mirrored under `.devdigest/specs/` (`specs/a.md` → `.devdigest/specs/specs/a.md`,
  `README.md` → `.devdigest/specs/README.md`); the 200-doc limit applies.
- **AC-10** WHEN the user deletes a `.devdigest` doc, the system SHALL ask for confirmation, naming how many
  agents (and which) have it attached for this repo; on confirm it SHALL delete the doc and detach it from all of
  them. Runs already started keep what they read. WHEN a repo is deleted, its `.devdigest` docs SHALL be deleted
  with it, and the repo delete confirmation SHALL say so.
- **AC-11** The system SHALL offer `.devdigest` docs in the agent Context tab and treat them like repo docs for
  attach, order, token sum, cap, "too large" and injection (SPEC-01 AC-6–AC-12), reading their last saved
  content; a Resync never makes them "missing". WHILE the repo is not cloned, attached `.devdigest` docs SHALL
  still be included in runs, and only the repo docs SHALL be reported unavailable in the trace.
- **AC-12** The system SHALL create, read, edit, upload, copy and delete `.devdigest` docs only for repos in the
  requesting user's workspace; a request naming another workspace's repo or doc SHALL be answered as not found.

## Edge cases

- **Repo and DevDigest doc with the same path:** a repo that itself tracks `.devdigest/specs/x.md` is not
  discovered; only the DevDigest doc exists at that path, and the page notes the ignored repo files (AC-4).
- **Empty repo (no repo docs, no `.devdigest` docs):** the empty state names the searched locations (SPEC-01 AC-4)
  and offers New file, Upload and Resync.
- **Doc over the 4,000-token cap:** it can be saved (≤ 1 MB) and attached; runs skip it as "too large" (SPEC-01).
- **Editing an attached doc while a review runs:** the running review keeps the version it read (AC-6).
- **Deleting the selected doc / its folder's last doc:** selection clears; the empty folder disappears.
- **Long names and deep folders:** names truncate with the full path on hover and in the accessible name.
- **Two tabs edit the same doc:** the last save wins (Non-goal).
- **Repo deleted and re-added:** its `.devdigest` docs were deleted with it (AC-10); the re-added repo starts with none.
- **Upload of several files where some names exist:** each conflicting file gets its own Overwrite / Cancel; the others are added (AC-8).
- **Repo at 200 `.devdigest` docs:** New file, Upload and Copy are refused with the limit as the reason (AC-5, AC-8, AC-9).

## Non-functional

- **Security:** `.devdigest` paths are validated (AC-5) and are names only — nothing is read from or written to
  the filesystem by path. Uploads are size-checked before being stored; binary content is refused.
- **Limits:** 1 MB per `.devdigest` doc (upload and save); at most 200 `.devdigest` docs per repo; Upload accepts
  `.md` only. Each limit is reported with a clear, specific error.
- **a11y:** the tree, its folders and the toolbar are keyboard-operable (expand/collapse with Enter/Space), every
  icon button has an accessible name, the Preview | Edit switch exposes its selected state.
- **i18n:** all UI text comes from message catalogs.

## Inputs (provenance)

- Repo docs, previews, tokens: `[reused: SPEC-01 discovery]` — files of the clone at the last synced commit.
- `.devdigest` docs, attached-agent counts: `[deterministic: DevDigest's stored docs and attachments]`.
- Last sync time: `[deterministic: repo sync state]`.
- Runs: `[new: 0 LLM calls]`; attached `.devdigest` docs count against the same 4,000-token cap × model calls as SPEC-01.

## Untrusted inputs

- `.devdigest` doc bodies (typed, pasted or uploaded) go into LLM prompts and are treated as untrusted data,
  exactly like repo docs: inside the engine's untrusted wrapping, never as instructions (SPEC-01).
- Uploaded file names are untrusted: validated as in AC-5 and shown as plain text.
- Preview never executes HTML or scripts from any doc.

## Module interactions

- **Repo sync:** Resync refreshes repo docs only; `.devdigest` docs are not affected. Not cloned → AC-4.
- **Agents (Context tab):** lists `.devdigest` docs with the repo's docs (AC-11); presentation is SPEC-04.
- **Reviews (run executor):** reads attached `.devdigest` docs from DevDigest storage, not the clone; while the
  repo is not cloned they are still included and only repo docs are unavailable (AC-11).
- **Repos (delete):** deleting a repo deletes its `.devdigest` docs; its confirmation says so (AC-10).
- **Onboarding Tour (SPEC-02):** reuses SPEC-01 discovery without `.devdigest` docs (Non-goal).
- **MCP server:** not involved.

## Design review

Sources: `docs/design/devdigest-2/screen_tour_context.jsx` (N6 page + empty state), `context_docs.jsx`
(source labels, preview drawer), `data_context.jsx`; current code of the Project Context page; SPEC-01.

User decisions (this spec):
- Storage: inside DevDigest (survives Resync and re-clone, available when not cloned), not in the clone.
- Delete of an attached doc: confirm, then detach from all agents.
- Upload: `.md` only, ≤ 1 MB per file, several files at once; an existing name → "Overwrite / Cancel".
  The 1 MB per-doc limit also applies to Save; at most 200 `.devdigest` docs per repo.
- New file: a name without `.md` gets `.md` appended.
- Copy: the repo path mirrored under `.devdigest/specs/`; when a copy exists, open it, don't overwrite, don't
  change agents' attachments.
- `.devdigest/` belongs to DevDigest: repo files there are not discovered; the page says they are ignored.
- Repo deleted → its `.devdigest` docs are deleted too, and the confirmation says so.
- Repo not cloned → attached `.devdigest` docs still go into runs.
- Onboarding Tour input → Non-goal for now.
- Grouping: source sections → folder tree.
- New folder: a path prefix only; empty folders are not kept.

Gaps found and how they are covered:
- N6 has no not-cloned, save-error, unsaved-changes, upload-rejection or delete-confirm states → AC-4, AC-6, AC-7, AC-8, AC-10.
- N6 footer "Indexed: 12 files · 1,240 chunks" → doc count + last sync time (AC-1); chunks are a Non-goal.
- N6 "Re-index" button → the repo's Resync (as in SPEC-01).
- N6 empty state "Add a spec file" → New file + Upload + Resync (Edge cases).

## [NEEDS CLARIFICATION]

none
