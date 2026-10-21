# Spec: Project context
Spec ID: SPEC-01
Status: implemented
Supersedes: —
Increment: editable project documents with local overrides (2026-10-21). AC-1 to AC-44 are `implemented`; AC-45 to AC-69 are `implemented` (2026-10-21). The `Status:` line stays `implemented` because the template allows only `draft | approved | implemented`.

## Problem and user

A reviewer agent judges a pull request against its own system prompt and its linked skills. It knows nothing about the rules the team wrote down in the repository itself: specs, architecture notes, incident write-ups. A repo owner who wants the agent to enforce a documented invariant (for example "module `api/` does not import `db/` directly") has to copy that text into a skill body by hand and keep the copy in sync.

Today the review prompt already has a `## Project context` slot (`assemblePrompt`, `specs` in `reviewer-core/src/prompt.ts`) and the run trace already has `prompt_assembly.specs`, but `ReviewRunExecutor` never fills the slot. The `Project Context` nav label and `useContextFiles` / `useReindexContext` exist in the client, but the server has no `/repos/:id/context` route and there is no page.

Users: the repo owner or agent author who configures agents and skills, and the reviewer who opens a run and wants to read exactly what text the model received. They notice the gap when a finding ignores a documented rule, and when the run drawer shows no project text.

This spec covers manual attachment only. Choosing documents automatically from PR content is a separate, later feature.

Increment (2026-10-21): the page shows a document's Markdown source in an Edit pane that cannot be changed. A repo owner who spots a wrong or outdated rule cannot fix the text the agents will read without committing to the repository, and `DevDigest` never writes to GitHub. They notice it when the Edit pill shows the source but offers no way to change it. The increment lets the owner edit an existing document and save it as a local override that agents read in place of the repository text.

## Goals / Non-goals

Goals:
- List the Markdown documents of an imported repository (specs, docs, insights) with their size in tokens.
- Let a user attach documents by hand to an agent and to a skill, per repository, in a chosen order.
- At run start, read the attached documents from the PR's base branch and add them to the review prompt as untrusted data under `## Project context`.
- Show, per run, which documents went into the prompt, with token counts and the full text.
- Keep a prompt with no attachments byte-identical to today's.
- Let a user edit the text of an existing document on the page and save it as a local override, without touching git or GitHub. *(Added 2026-10-21.)*
- Let runs read the override instead of the repository text, and show in the run drawer that a document was modified locally. *(Added 2026-10-21.)*
- Let the user reset a document to its repository version. *(Added 2026-10-21.)*

Non-goals:
- Automatic or PR-content-based document selection.
- Creating, uploading or deleting documents from the page (the design's `+`, folder and upload icons stay disabled). *(Revised 2026-10-21: editing an existing document is now in scope, see AC-45 to AC-69; it was previously listed here together with creating, uploading and deleting.)*
- Pushing an edit to GitHub, committing it, or writing it into the clone; overrides are local to this DevDigest installation.
- Merging, diffing or three-way resolving an override against a changed repository version.
- Version history of overrides; only the latest saved text is kept.
- Editing a document that is `too_large` or not in the current listing.
- Per-agent or per-skill overrides of a document; an override is per (repository, path) and applies to every agent and skill that attaches the path.
- An MCP tool for editing documents.
- The "Indexed: N files · N chunks" footer of the design; no embeddings or chunking are involved. *(Revised 2026-10-21: the design's coverage ring is in scope as the share of enabled agents using the opened document, see AC-26; the add, folder and upload icons are shown disabled until they have a backend.)*
- A per-repository override of the discovery glob.
- Attaching documents that are not Markdown, or that sit outside the discovery roots.
- Structured "source document" fields on findings; the findings contract does not change.
- An extra LLM call to summarise or select documents.
- An MCP tool for attachments.
- Reading attached documents from the PR head revision.

## User stories

- US-1 · As a repo owner, I want to see every specs, docs and insights Markdown file of an imported repository with its token size, so that I know what I can attach and what it costs.
- US-2 · As a repo owner, I want to preview a document on the Project Context page and see which agents and skills use it, so that I can judge it before attaching.
- US-3 · As an agent author, I want to attach documents to an agent on a Context tab, in an order I choose, so that this agent reviews against them.
- US-4 · As an agent author, I want to attach documents to a skill, so that every agent using the skill inherits them.
- US-5 · As a reviewer, I want a run to read the attached documents and place them in the prompt as untrusted data, so that the agent can ground its findings in them.
- US-6 · As a reviewer, I want the run drawer to list the documents that went into the prompt with their token counts and open each full text, so that I can verify what the model saw.
- US-7 · As an agent author, I want warnings about size, missing files and truncation, so that attaching too much never fails silently or breaks a run.
- US-8 · As a repo owner, I want to change a document's text on the Project Context page and save it, so that agents review against my corrected wording without a commit to the repository.
- US-9 · As a reviewer, I want a run to read the edited text and the run drawer to say a document was modified locally, so that I know the model did not see the repository version.
- US-10 · As a repo owner, I want to reset an edited document to its repository version, so that I can undo a local change in one step.

## Acceptance criteria (EARS)

Constants stated once here and referenced below: `PROJECT_CONTEXT_DOC_MAX_TOKENS` = 8,000 tokens per document; `PROJECT_CONTEXT_RUN_MAX_TOKENS` = 24,000 tokens per assembled prompt (per file chunk in map-reduce runs); `PROJECT_CONTEXT_FILE_MAX_CHARS` = 200,000 characters (equal to `SHOW_FILE_MAX_CHARS` in `adapters/git/simple-git.ts`); default discovery glob `**/{specs,docs,insights}/**/*.md`.

Discovery and page (US-1, US-2)

- AC-1 (US-1) · WHEN a client calls `GET /repos/:id/context` **(new route)**, the system shall return the Markdown files of that repository at its default branch that match the configured discovery glob, each as a `SpecFile` (existing contract in `contracts/platform.ts`, extended **(new fields)** with `kind` and `tokens`).
- AC-2 (US-1) · The system shall read the discovery glob from one server setting **(new)** whose default is `**/{specs,docs,insights}/**/*.md`.
- AC-3 (US-1) · The system shall exclude files under `node_modules/` and under any dot-folder from discovery.
- AC-4 (US-1) · The system shall set `kind` to the nearest ancestor path segment that is one of `specs`, `docs`, `insights`.
- AC-5 (US-1) · The system shall compute `tokens` for each document with `container.tokenizer.count` over the document text.
- AC-6 (US-1) · IF a matched file is larger than `PROJECT_CONTEXT_FILE_MAX_CHARS`, THEN the system shall list it with a `too_large` marker **(new field)**, without `tokens`, and shall reject any attempt to attach it with a 422 error.
- AC-7 (US-1) · The system shall list files through a new `GitClient` method **(new)** that reads the git object database of the default branch, and shall cache the listing per head sha of that branch.
- AC-8 (US-2) · WHEN the user opens the Project Context page **(new route and nav entry)**, the page shall show, for the repository selected in the app's sidebar, a file panel on the left and a document pane filling the rest, and shall show no page title (the breadcrumb names the page). The file panel shall hold the section label "Project context", the folder the listed documents share, the toolbar, one compact row per document showing only its file icon and its name relative to the shared folder plus a "modified" dot or a "too large" badge where applicable, and a footer "N documents · ≈ M tokens". The document pane shall hold a header row (document name, "Modified" badge where applicable, Preview/Edit pills, then, on the right, the token badge, "Used by N agents" and the coverage ring of AC-26) and a body showing the selected document rendered as Markdown, the editor of AC-59, or the too-large notice. The page shall show no per-row kind tag, token count or usage count; the page shall have no repository selector of its own, and WHEN the user changes the sidebar repository while on the page, the page shall stay open and list the newly selected repository. *(Revised 2026-10-21: the page originally had its own selector.)* *(layout revised 2026-10-21 to the file-panel design)*
- AC-9 (US-2) · WHEN the user selects a document, the system shall return its text through a new route **(new)** that reads it with `GitClient.showFile` at the default branch head and applies the same path-safety rules as `showFile`. *(Refined by AC-50: the returned text is the effective text.)*
- AC-10 (US-2) · WHEN a client calls the listing route with `refresh=true`, the system shall re-list the repository and bypass the per-head-sha cache; the page header has no refresh button; the toolbar above the document list has a refresh icon that re-lists the repository bypassing the cache. *(Revised 2026-10-21: the page's Refresh button was removed at the user's request; the API behaviour is unchanged; toolbar icon added 2026-10-21.)*
- AC-11 (US-1) · IF the repository has no matching file, THEN the page shall show an empty state that names the discovery roots.
- AC-12 (US-1) · IF the repository has no clone, or the listing fails, THEN the page shall show an error state with a retry control and the API shall answer with the standard `{ error: { code, message, details } }` envelope.

Attachment (US-3, US-4)

- AC-13 (US-3) · The system shall store, per (repository, agent), an ordered list of repo-relative document paths in a new link table **(new)** and shall store no document text. *(The override table of AC-45 is the only place document text is stored.)*
- AC-14 (US-4) · The system shall store, per (repository, skill), an ordered list of repo-relative document paths in a new link table **(new)** and shall store no document text. *(Same exception as AC-13.)*
- AC-15 (US-3) · WHEN a client calls `GET /agents/:id/context?repo_id=` **(new)**, the system shall return the attached paths of that agent for that repository in stored order, each with a `missing` flag set when the path is no longer in the current listing.
- AC-16 (US-3) · WHEN a client calls `PUT /agents/:id/context` **(new)** with `{ repo_id, paths }`, the system shall replace the whole ordered list, require every path to appear once and match a listed, attachable document (422 otherwise), and return the stored list.
- AC-17 (US-3) · WHEN the stored agent list changes in content or order, the system shall bump `agents.version` and snapshot the list into `agent_versions` in one transaction, as `AgentsRepository.setSkills` does for skills; an identical list shall be a no-op.
- AC-18 (US-4) · WHEN a client calls `GET` or `PUT /skills/:id/context` **(new)** with the same shapes as AC-15 and AC-16, the system shall behave as for agents, except that a change shall not bump `skills.version` and shall not write a `skill_versions` row.
- AC-19 (US-3, US-4) · The system shall delete a link row when its agent, skill or repository is deleted.
- AC-20 (US-3) · The agent editor shall show a Context tab **(new)** with: a repo selector, a filter box, one row per listed document (drag handle, checkbox, path, `kind` tag, token count, Preview button), the badge "N of M attached", and a footer with the total tokens of the attached documents.
- AC-21 (US-4) · The skill editor shall show a Context tab **(new)** titled "Project context to use" with the same rows, the badge "N attached", the hint that agents using the skill inherit the documents, and a block that serialises as the heading `## Project context` followed by one path line per attached document.
- AC-22 (US-3, US-4) · The repo selector of the Context tabs shall default to the workspace's only repository, or, when there are several, to the app's active repository as the shell resolves it (URL, then localStorage, then the first repository).
- AC-23 (US-3, US-4) · WHEN the user changes the checked set or the order, the tab shall save through the matching `PUT` and roll the change back with an error toast if the call fails.
- AC-24 (US-7) · WHILE the summed `tokens` of the checked documents is above `PROJECT_CONTEXT_RUN_MAX_TOKENS`, the tab shall show a warning before the change is saved, naming the cap and the total.
- AC-25 (US-7) · WHEN a checked document is `missing` or `too_large`, the tab shall mark its row with a "missing" or "too large" badge instead of hiding it.
- AC-26 (US-2) · The system shall report, for each listed document, how many agents and skills attach it in the selected repository, and how many distinct enabled agents receive it at run time (attached directly or through an enabled linked skill); the page shall show the latter as "Used by N agents" in the header of the document pane of the opened document, together with a coverage ring equal to that count over the number of enabled agents, and shall show no usage count on the file-panel rows. *(Extended 2026-10-21; page wording aligned to the file-panel layout 2026-10-21.)*

Run (US-5)

- AC-27 (US-5) · WHEN a run starts, the system shall resolve the document list for the PR's repository: the agent's attached paths in stored order, then, for each enabled skill linked to the agent in link order, that skill's attached paths in stored order, with a path that already appeared skipped (first occurrence wins).
- AC-28 (US-5) · The system shall not include documents of a skill that is disabled.
- AC-29 (US-5) · The system shall read each resolved document with `GitClient.showFile` at the PR's base branch, not the head sha. *(Refined by AC-55: a local override replaces the base-branch text.)*
- AC-30 (US-5) · WHEN the resolved list is non-empty, the system shall pass the document texts to `reviewPullRequest` as `specs`, and `assemblePrompt` shall render them under `## Project context`, each wrapped by `wrapUntrusted` with `source` equal to the repo-relative path.
- AC-31 (US-5) · The system shall keep the `## Project context` slot at its current position, after `## Repo skeleton` and before `## Callers of changed symbols`.
- AC-32 (US-5) · The system shall include attached project documents in the `INJECTION_GUARD` list of untrusted content in `reviewer-core/src/prompt.ts`.
- AC-33 (US-7) · IF a document exceeds `PROJECT_CONTEXT_DOC_MAX_TOKENS`, THEN the system shall truncate its text to that limit, mark the block `truncated`, and write a run log line naming the path.
- AC-34 (US-7) · IF adding a document would take the prompt total above `PROJECT_CONTEXT_RUN_MAX_TOKENS`, THEN the system shall skip it and every later document and write a run log line naming each skipped path.
- AC-35 (US-7) · IF a resolved document cannot be read (missing at the base branch, over the size cap, no clone, read error), THEN the system shall skip it, write a run log line with the path and the reason, and continue the run; a context failure shall never mark the run `failed`.
- AC-36 (US-5) · WHERE no document resolves for the run (no attachments, or all skipped), the system shall produce a prompt byte-identical to the prompt produced without this feature and shall set no `context_blocks`, `context_tokens` or `specs` value.
- AC-37 (US-5) · The system shall add no LLM call for reading, selecting or summarising documents.
- AC-38 (US-5) · WHEN a run reads documents, the system shall write one run log line per document `Context attached: <path> (<tokens> tokens, <agent | skill:name>)` and one summary line with the document count and total tokens.
- AC-39 (US-5) · WHEN an agent with an attached document stating "module `api/` does not import `db/` directly" reviews a PR whose diff violates it, the finding shall be able to cite that document: an integration test using the mock LLM shall assert that the prompt contains the document under `<untrusted source="<path>">` and that a finding naming the path survives grounding and is persisted.

Trace and drawer (US-6)

- AC-40 (US-6) · The system shall add to `PromptAssembly` **(new fields)** `context_tokens` (integer, tokenizer count of the whole `## Project context` block, nullish) and `context_blocks[]` of `{ path, tokens, text, truncated, source }` where `source` is `'agent'` or `'skill:<name>'`, mirroring `skill_blocks`; the change shall be made in `server/src/vendor/shared/contracts/trace.ts` and copied to the client copy.
- AC-41 (US-6) · The system shall keep `RunTrace.specs_read` as `string[]` and shall list in it the attached paths that went into the prompt, in addition to the existing intent refs.
- AC-42 (US-6) · WHEN the user opens the run drawer, the Prompt assembly section shall show the block "Project context — attached specs (untrusted)" with its token total, and one collapsible sub-block per document labelled with the path, its token count, its source and a "truncated" mark where applicable, each openable to the full text sent to the model.
- AC-43 (US-6) · WHEN the user opens the run drawer, the Configuration section shall list each document of `specs_read` that has a `context_blocks` entry together with its token count.
- AC-44 (US-6) · WHERE a run has no `context_blocks`, the drawer shall show no Project context sub-blocks and the Specs read row shall show only the intent refs, or "none" when there are none.

Editable documents and local overrides (US-8, US-9, US-10) *(added 2026-10-21)*

- AC-45 (US-8) · The system shall store local overrides in a new workspace-scoped table **(new)** keyed by (repository, path) holding the edited `text`, the git blob `sha` of the repository version the edit was based on, and `updated_at`, and shall delete an override when its repository is deleted.
- AC-46 (US-8) · WHEN a client calls `PUT /repos/:id/context/file` **(new)** with `{ path, text }`, the system shall upsert the override for that (repository, path), set `updated_at`, record the blob `sha` of the default-branch version, and return the same shape as AC-50 with `modified: true`.
- AC-47 (US-8) · IF the `PUT` path is not in the current listing, is `too_large`, or fails the `isSafeRepoPath` rules, or IF `text` is empty or longer than `PROJECT_CONTEXT_FILE_MAX_CHARS`, THEN the system shall answer 422 with the standard error envelope and shall change nothing.
- AC-48 (US-8) · IF the `PUT` text is identical to the repository text of the document, THEN the system shall store no override, shall remove an existing one, and shall return `modified: false`.
- AC-49 (US-10) · WHEN a client calls `DELETE /repos/:id/context/file?path=` **(new)**, the system shall remove the override for that (repository, path) and return the repository version in the shape of AC-50; WHERE no override exists, the call shall succeed and change nothing.
- AC-50 (US-8) · WHEN a client calls `GET /repos/:id/context/file?path=`, the system shall return the effective text (the override when one exists, otherwise the default-branch text) and `modified: boolean` **(new field of `ContextFileContent`)**, and, WHERE `modified` is true, also `repo_text` and `updated_at` **(new nullish fields)**.
- AC-51 (US-8) · WHEN a client calls `GET /repos/:id/context[?refresh=true]`, the system shall set `modified: true` **(new field of `SpecFile`)** on each document that has an override and shall compute its `tokens` with `container.tokenizer.count` over the override text; the system shall merge overrides on every call and shall not store them in the per-head-sha listing cache.
- AC-52 (US-8) · The system shall write nothing to the clone, to git history or to GitHub when an override is saved or reset.
- AC-53 (US-8) · IF an override exists for a path that is no longer in the current listing, THEN the system shall ignore it for the listing, the attachment `missing` flag (AC-15) and runs, and shall keep the stored row.
- AC-54 (US-9) · The system shall use the saved text of the override for (repository, path) in place of the base-branch text when `resolveForRun` reads a resolved document, for every pull request of that repository and every agent that attaches the path; WHERE no override exists, it shall read the base branch as in AC-29.
- AC-55 (US-9) · The system shall treat the override text exactly like repository text in the prompt: wrapped by `wrapUntrusted` with `source` equal to the path, counted by `container.tokenizer.count`, and subject to `PROJECT_CONTEXT_DOC_MAX_TOKENS`, `PROJECT_CONTEXT_RUN_MAX_TOKENS` and the log lines of AC-33 to AC-35.
- AC-56 (US-9) · WHEN a run attaches a document that has an override, the system shall append "modified locally" to its run log line of AC-38 (`Context attached: <path> (<tokens> tokens, <source>, modified locally)`).
- AC-57 (US-9) · The system shall add to each `PromptAssembly.context_blocks[]` entry a `modified` field **(new, `PromptContextBlock.modified`, boolean, nullish in traces written before this increment)**, true when the block text came from an override; the change shall be made in `server/src/vendor/shared/contracts/trace.ts` and copied to the client copy.
- AC-58 (US-9) · WHERE a `context_blocks` entry has `modified` true, the run drawer shall label its sub-block "Modified locally"; WHERE `modified` is false, absent or null, it shall show no such label.
- AC-59 (US-8) · WHEN the user selects the Edit pill on an opened document, the page shall replace the read-only source with an editable monospace textarea (design-system `Textarea`) holding the effective text.
- AC-60 (US-8) · The page shall show a Save button in Edit mode, enabled only WHILE the textarea text differs from the effective text and the text is within `PROJECT_CONTEXT_FILE_MAX_CHARS`.
- AC-61 (US-8) · WHILE the textarea text is longer than `PROJECT_CONTEXT_FILE_MAX_CHARS`, the page shall show the character count against the cap and shall keep Save disabled.
- AC-62 (US-8) · WHEN the user saves, the page shall send one `PUT` of AC-46 and, on success, shall show a success toast, the "Modified locally" badge, the updated token badge, and the new text in Preview, and shall refresh the document list so the row marker and `tokens` update.
- AC-63 (US-8) · IF the save call fails, THEN the page shall show an error toast, shall keep the user's unsaved text in the textarea, and shall leave the document unchanged.
- AC-64 (US-8) · WHILE the document is in Edit mode, WHEN the user presses Ctrl+S or Cmd+S, the page shall perform the save of AC-62 and suppress the browser's own save dialog; WHERE the text equals the effective text, it shall do nothing.
- AC-65 (US-10) · WHERE a document has an override, the page shall show a "Reset to repository version" action; WHEN the user confirms the dialog, the page shall send the `DELETE` of AC-49, show the repository text, and remove the badge and the row marker.
- AC-66 (US-8) · WHERE a document is `modified`, the page shall show a "Modified locally" badge next to its path on the opened document and a small marker on its row in the list.
- AC-67 (US-8) · IF the user selects another document, leaves Edit mode, or changes the sidebar repository while the textarea holds unsaved changes, THEN the page shall ask for confirmation and shall discard the changes only when the user confirms.
- AC-68 (US-8) · The page shall render Preview from the effective text, and the Preview button of the agent and skill Context tabs shall show the effective text with the same "Modified locally" badge.
- AC-69 (US-8) · WHERE a document is `too_large` or the user cannot edit it (AC-47), the page shall show the Edit pill's content read-only as today and shall name the reason.

## Edge cases

| Case | What the user sees | Ties to |
|---|---|---|
| A PR edits an attached spec | The run reads the base-branch version; the PR's edit is not applied to the rules. The drawer shows the base text. | AC-29 |
| An attached file was renamed or deleted on the default branch | Row shows a "missing" badge; the run skips it and logs the reason; the run succeeds. | AC-25, AC-35 |
| A file is larger than 200,000 characters | Listed as "too large", checkbox disabled; if already attached the row is flagged and the run skips it. | AC-6, AC-35 |
| One document above 8,000 tokens | Run attaches the first 8,000 tokens, block marked "truncated", log line names the path. | AC-33 |
| Total above 24,000 tokens | Tab warns before saving; at run time later documents are skipped and logged. | AC-24, AC-34 |
| The same path is attached to the agent and to a skill, or to two skills | Included once, at its first position; the block `source` is the first owner. | AC-27 |
| Agent attaches nothing, skill attaches documents | Skill documents still apply. | AC-27 |
| Attachment exists for repo A, PR belongs to repo B | Only repo B's attachments are used; repo A's are ignored. | AC-27 |
| Document text contains `</untrusted>` or instructions to the reviewer | Delimiter-escaped by `wrapUntrusted`; treated as data. | AC-30, AC-32 |
| Two runs on the same PR, or a run during a re-sync | Each run reads at its own PR base branch; a cached listing is keyed by head sha, so a moved branch gives a fresh listing. | AC-7, AC-29 |
| Repo without a clone, or Postgres/git unavailable | Page error state with retry; runs log "Context skipped" and continue. | AC-12, AC-35 |
| Non-UTF8 or binary content in a `.md` file | Skipped at run time with a log line; shown in the list without a preview error. | AC-35 |
| Skill disabled on the Skills page | Its documents do not appear in the prompt. | AC-28 |
| Run cancelled mid-flight | No new behaviour; the run is cancelled as today. | — |
| Zero documents anywhere | Prompt byte-identical to today. | AC-36 |
| Double submit of the same `PUT` | Identical list is a no-op: no version bump. | AC-17 |
| Keyboard use | Rows, checkboxes, Preview and reorder are operable by keyboard; reorder has up/down controls as the Skills tab does. | AC-20 |
| The repository version of an edited document changes after the edit (new commit on the default branch) | The override keeps applying; the page shows the override as the effective text and `repo_text` holds the new repository text. No warning in this increment (settled, see Open questions). | AC-50, AC-54 |
| The edited document is deleted or renamed on the default branch | It leaves the listing and shows "missing" in attachments; the stored override is ignored and kept. If the path returns, the override applies again. | AC-53 |
| The user saves text identical to the repository text | No override is stored, an existing one is removed, the badge disappears. | AC-48 |
| The user clears the textarea and saves | Save is rejected with a validation message (422); to return to the repository text the user uses Reset. | AC-47 |
| Text above 200,000 characters | The counter shows the overflow and Save stays disabled; a direct API call gets 422. | AC-47, AC-61 |
| An edited document above 8,000 tokens | Runs truncate it to 8,000 tokens, mark the block `truncated` and log it, exactly as for repository text. | AC-55 |
| Two browser tabs edit the same document | Last save wins; the other tab shows the older text until its list refreshes. No conflict dialog. | AC-46 |
| Double submit of the same `PUT` | Same text upserts the same row; only `updated_at` moves. | AC-46 |
| Reset on a document with no override | Succeeds, nothing changes. | AC-49 |
| A run is in flight while the user saves | The run uses the text it read at its start; the next run uses the new text. | AC-54 |
| Edited text contains `</untrusted>` or instructions to the reviewer | Delimiter-escaped by `wrapUntrusted`; treated as data. | AC-55 |
| Old runs opened after the increment | Drawer shows their blocks without a "Modified locally" label (`modified` nullish). | AC-57, AC-58 |
| The user presses Ctrl/Cmd+S outside Edit mode | Browser default is not suppressed. | AC-64 |
| Repository has no clone or the listing fails | Edit and Save are unavailable with the existing error state; no override is written. | AC-12, AC-47 |
| The repository is re-imported or deleted | Deleting the repository deletes its overrides; a re-sync keeps them. | AC-45 |

## Non-functional requirements

- Cost: no model call is added. Added input tokens are bounded by `PROJECT_CONTEXT_RUN_MAX_TOKENS` per assembled prompt (per file chunk in map-reduce runs, where the same context repeats in every chunk, exactly as skill blocks do); the Context tab shows the total before the user runs anything.
- Latency: listing a repository with up to 500 matching files returns in under 2 s on a warm cache; the cold listing path is bounded by one `git ls-tree` plus one blob read per file for token counts. Reading attached documents adds under 1 s to run start for 10 documents.
- Token counts are tokenizer approximations (`cl100k_base`, with the chars/4 fallback) and are labelled as approximate in the UI.
- Security: file contents, paths and names are untrusted data. Paths are validated with the `isSafeRepoPath` rules before any git call. Documents are read from the git object database, never from the working tree. No secret is read or stored.
- Accessibility and i18n: all new strings are `next-intl` keys under a dotted namespace; colours come from CSS variables; new UI pieces (document row, token badge) are added to `/showcase`.
- Persistence: new tables are workspace-scoped and created through `pnpm db:generate`; migrations do not run on boot.
- The reviewer-core engine stays pure: it receives document texts and paths as arguments and performs no I/O.
- Increment, cost: no model call is added; override text is bounded by the same per-document and per-run token caps (AC-55), so added input tokens do not grow.
- Increment, latency: saving or resetting is one request and returns within 1 s for a 200,000-character document; the listing merges overrides on every call with one query per repository and keeps the 2 s warm-cache bound of this section.
- Increment, security: the path is validated against the current listing and the `isSafeRepoPath` rules before any write; the text is size-capped; every override query is workspace-scoped; no git write, no GitHub write, no secret involved.
- Increment, persistence: the override table is created through `pnpm db:generate`, cascades on repository delete and is not run on boot.
- Increment, accessibility and i18n: all new strings (Save, Reset, "Modified locally", confirmation texts, counter) are `next-intl` keys; colours come from CSS variables; the textarea has a label, the confirm dialogs are keyboard operable, and the row marker has a text alternative; new UI pieces are added to `/showcase`.

## Inputs and provenance

| Input | Source | Provenance | Owner |
|---|---|---|---|
| Document list (path, kind, size) | `GET /repos/:id/context` over a git listing of the default branch | [new] (new `GitClient` method; `SpecFile` extended) | server, `modules/repos` or a new context module |
| Discovery glob | server setting, default `**/{specs,docs,insights}/**/*.md` | [new] | server |
| Document `kind` | nearest ancestor segment among `specs`, `docs`, `insights` | [deterministic: computed from the path, no model] | server |
| Token count per document and per run | `container.tokenizer.count` | [reused: `container.tokenizer`, `TiktokenTokenizer`] | server |
| Document text for preview | `GitClient.showFile(repo, sha, path)` | [reused: `showFile`] | server |
| Document text for a run | `GitClient.showFile` at the PR's base branch | [reused: `showFile`] | `ReviewRunExecutor` |
| Agent attachments | link table per (repo, agent) | [new] | `modules/agents` |
| Skill attachments | link table per (repo, skill) | [new] | `modules/skills` |
| Merge order and de-duplication | resolved at run start | [deterministic: computed in code, no model] | `ReviewRunExecutor` |
| Skill link order, enabled flag | `agentsRepo.linkedSkills` | [reused: `skillBlocksForTrace` rules in `server/specs/skills.md`] | `modules/agents` |
| `## Project context` section and `<untrusted>` wrap | `assemblePrompt`, `wrapUntrusted` | [reused: `reviewer-core/src/prompt.ts`] | reviewer-core |
| `context_blocks[]`, `context_tokens` | trace written by the executor | [new] (contract in `trace.ts`) | server |
| `specs_read` | trace | [reused: `RunTrace.specs_read`] | server |
| Repo selector default | the workspace's repository list; the app's active repository from the shell (URL > localStorage > first repository) | [reused: `GET /repos`, repo shell state] | client |
| Page layout, tabs, rows | the four supplied design screens | [new] | client |
| Override text, `sha`, `updated_at` *(2026-10-21)* | `PUT /repos/:id/context/file` from the user, stored in the override table | [new] | server, `modules/project-context` |
| Blob `sha` of the repository version at save time | git object database of the default branch | [deterministic: read from git, no model] | server |
| `modified`, `repo_text` on file read and listing | override table joined at read time | [deterministic: computed in code, no model] | server |
| Effective text for a run *(2026-10-21)* | override when present, otherwise `GitClient.showFile` at the PR's base branch | [reused: `resolveForRun`, `showFile`] | `ReviewRunExecutor` |
| `PromptContextBlock.modified` | trace written by the executor | [new] (contract in `trace.ts`) | server |
| Edit, Save, Reset, badge, marker, confirmations | the existing Edit and Preview pills, plus the user's request | [new] | client |

## Untrusted inputs

| Input | Handling |
|---|---|
| Markdown content of repository files | Data only. Wrapped by `wrapUntrusted` with `source` = path; `</untrusted>` is escaped; `INJECTION_GUARD` names attached project documents as untrusted (AC-32); no keyword scanning. Read at the base branch so a PR cannot change its own rules (AC-29). |
| File paths and names | Validated with the `isSafeRepoPath` rules (relative, no `..`, no leading dash, bounded length) before any git call; used only as a label and as a `showFile` argument; rendered as text in the UI, never as HTML. |
| Paths submitted in `PUT .../context` | Accepted only if they match a listed, attachable document of the given repository; otherwise 422. |
| The discovery glob setting | Server configuration, not user input from a PR; applied to the git listing only. |
| PR title, body and diff | Unchanged from today; wrapped as today. |
| LLM output citing a document | Treated as any finding: it must still cite a line present in the diff to survive grounding. |
| Markdown rendered in the preview | Rendered with the same Markdown renderer as the skill body preview; no script execution. The same holds for edited text. |
| Edited document text (`PUT` body) | User-authored but treated as untrusted data like repository text: capped at `PROJECT_CONTEXT_FILE_MAX_CHARS`, never interpreted, wrapped by `wrapUntrusted` in prompts, rendered as Markdown without script execution, never logged in full. The path in the body is accepted only if listed and attachable (AC-47). |
| Stored override read back at run time | Same handling as repository text; a local edit does not lift the injection guard (AC-32) or the caps (AC-55). |

## Open questions

None open: the user accepted the suggested answer for every question of the analyze round. Settled after the planner review:

- Repo selector default (AC-22): the only repository, or the app's active repository as the shell resolves it (URL > localStorage > first repository); pull requests have no import timestamp.
- Token cap scope (NFR Cost, AC-34): the context stays in every chunk of a map-reduce run; `PROJECT_CONTEXT_RUN_MAX_TOKENS` bounds each assembled prompt, as skill blocks behave.

Values the user may still revise, with what changes:

- The token numbers (8,000 per document, 24,000 per run) and the 200,000-character cap are placeholders from the answers; changing them changes only AC-6, AC-24, AC-33, AC-34 and the NFR on added tokens.
- The latency figures in the NFR section (500 files, 2 s, 1 s) are proposed by this spec and were not given by the user; confirm or replace them.
- The new route names (`/repos/:id/context`, `/agents/:id/context`, `/skills/:id/context`, the file-read route) and the discovery-glob setting name are fixed by the planner; only their behaviour is specified here.

Increment 2026-10-21 (editable documents). Taken from the user's design answers: local override table, `PUT`/`DELETE`/`GET /repos/:id/context/file`, runs read overrides, `PromptContextBlock.modified`, Save and Reset with confirmations, Ctrl/Cmd+S. Settled for the increment (the user accepted the suggested answer for all five):

1. Empty text: rejected with 422 and a pointer to Reset (AC-47).
2. Stale override after the repository text changes: the override keeps winning, no warning; a `base_changed` flag is deferred (AC-50, AC-54).
3. Override of a path missing from the listing: ignored but kept (AC-53).
4. Override at run time: applies whatever the PR's base branch, as it is per (repository, path) (AC-54).
5. Unsaved-changes dialog: Discard and Cancel only, no "Save and continue" (AC-67).

Open after this round: none.
