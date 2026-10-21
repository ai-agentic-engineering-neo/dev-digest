# Project context — server

Attach Markdown documents of an imported repository (specs, docs, insights) to
an agent or a skill by hand. At run start the documents are read from the PR's
base branch and rendered into the review prompt under `## Project context` as
untrusted data. A document can be edited and saved as a local override that
runs read instead of the repository text. This file owns the API, the data
model, the run resolution and the trace contract. The UI half is
[`client/specs/project-context.md`](../../client/specs/project-context.md). How
and why it is built this way: [`../docs/project-context.md`](../docs/project-context.md).

Spec: specs/project-context.md (SPEC-01)

Status: **implemented 2026-10-20**; editable documents with local overrides
(AC-45 to AC-69) **implemented 2026-10-21**. Manual attachment only: nothing
selects a document automatically.

## Data model (migrations `0014`, `0015`)

| Table | Role |
|---|---|
| `agent_context_docs` | ordered attachment of a document path to an agent in one repo: `workspace_id`, `agent_id`, `repo_id`, `path`, `order`; primary key `(agent_id, repo_id, path)`; index on `repo_id` |
| `skill_context_docs` | the same for a skill: `skill_id` instead of `agent_id`; primary key `(skill_id, repo_id, path)` |
| `context_doc_overrides` (`0015`) | the local override of one document: `workspace_id`, `repo_id`, `path`, `text`, `sha` (git blob of the repository version the edit was based on), `updated_at` (default `now()`); primary key `(repo_id, path)` |

Every foreign key cascades, so a link row or an override goes with its
workspace, agent, skill or repository. A link row stores only the repo-relative
path, never document text; the override table is the one place text is stored
(schema in `src/db/schema/project-context.ts`). An override is per
(repository, path): it applies to every agent and skill that attaches the path.

An agent version snapshot (`agent_versions.config_json`) gains `context`: a map
`{ [repo_id]: string[] }` with the attached paths of **every** repo, written by
`AgentsRepository.snapshotVersion`, so any version replays its attachments.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `PROJECT_CONTEXT_GLOB` (`AppConfig.projectContextGlob`, `platform/config.ts`) | `**/{specs,docs,insights}/**/*.md` | one string, an empty value falls back to the default; braces are expanded in code (`globToPathspecs`); no per-repo override |

Constants (`modules/project-context/constants.ts`):

| Constant | Value | Meaning |
|---|---|---|
| `PROJECT_CONTEXT_DOC_MAX_TOKENS` | 8,000 | tokens of one document sent to the model; more is cut |
| `PROJECT_CONTEXT_RUN_MAX_TOKENS` | 24,000 | summed document tokens of one assembled prompt (per chunk in a map-reduce run) |
| `PROJECT_CONTEXT_FILE_MAX_CHARS` | 200,000 | blob size in bytes above which a file is `too_large`; equals `SHOW_FILE_MAX_CHARS` of `adapters/git/simple-git.ts`; also the longest override text in characters |
| `OVERRIDE_BODY_LIMIT` | 1,310,720 | body limit in bytes of `PUT /repos/:id/context/file`: 200,000 characters at up to 6 bytes each once JSON-escaped, plus the envelope; the character cap decides, not the app's 1 MiB default |
| `PROJECT_CONTEXT_MAX_TOKEN_RUN_CHARS` | 2,000 | longest whitespace-free run the tokenizer may see (see invariant 10) |
| `LIST_READ_CONCURRENCY` | 8 | parallel blob reads on a cold listing |
| `MAX_ATTACHED_PATHS` / `MAX_PATH_CHARS` | 200 / 300 | most paths one `PUT` carries / longest path |

## API (`modules/project-context/routes.ts`)

| Route | Input | Result |
|---|---|---|
| `GET /repos/:id/context` | `?refresh=true` optional | `SpecFile[]` sorted by path (see below) |
| `GET /repos/:id/context/file` | `?path=` (1..300 chars) | `ContextFileContent` of the effective text (see below) |
| `PUT /repos/:id/context/file` | `{ path, text }` (`ContextFileUpdate`: path 1..300 chars, text at most 200,000 chars) | `ContextFileContent` after the save |
| `DELETE /repos/:id/context/file` | `?path=` (1..300 chars) | `ContextFileContent` of the repository version |
| `GET /agents/:id/context` | `?repo_id=` (uuid) | `ContextAttachment[]` in stored order |
| `PUT /agents/:id/context` | `{ repo_id, paths }` (`ContextAttachmentsUpdate`, at most 200 paths) | the stored `ContextAttachment[]` |
| `GET /skills/:id/context` | `?repo_id=` | `ContextAttachment[]` |
| `PUT /skills/:id/context` | `{ repo_id, paths }` | the stored `ContextAttachment[]` |

`SpecFile` (existing contract, extended): `path`, `size` (bytes), `kind`
(`specs` · `docs` · `insights` · `null`), `tokens` (null when `too_large` or
unreadable), `too_large`, `agent_count`, `skill_count` (agents and skills
attaching the path in this repo), `modified` (the document has a local
override; false for a `too_large` document). `content` and `updated_at` stay
unset. For a modified document `tokens` counts the override text.
`ContextAttachment`: `path`, `order`, `missing` (no longer in the listing),
`too_large`.

`ContextFileContent` (`GET`, `PUT` and `DELETE` of `/repos/:id/context/file`):
`path`, `sha` (the default-branch commit the listing resolved), `text` (the
**effective** text: the override when one exists, otherwise the default-branch
text), `modified` (boolean), and, only when `modified` is true, `repo_text`
(the default-branch text) and `updated_at` (ISO time of the last save).

Override semantics:

- `PUT` upserts the override for (repository, path), records the git blob sha of
  the listed default-branch version and moves `updated_at`; the answer has
  `modified: true`. Saving the same text twice only moves `updated_at`.
- `PUT` with text identical to the repository text stores nothing, removes an
  existing override and answers `modified: false`.
- `DELETE` removes the override and answers the repository version
  (`modified: false`). A listed path without an override succeeds and changes
  nothing.
- Nothing is written to the clone, to git history or to GitHub: the service's
  git dependency stays `Pick<GitClient, 'listFiles' | 'showFile'>`.

Errors (the standard `{ error: { code, message, details } }` envelope):

| Status | When |
|---|---|
| 404 | repo, agent or skill not in the workspace; `?path=` not in the listing (`GET` and `DELETE` of `/repos/:id/context/file`; a stored override of such a path is kept) |
| 409 `repo_not_cloned` | the repo has no `clone_path` |
| 422 | unsafe path; a `too_large` document on `?path=` (`GET` and `DELETE`, the override row is kept); `PUT .../context` paths that repeat, are not listed or are `too_large` (`details.issues[] { path, reason: duplicate \| unknown \| too_large }`); `PUT .../context/file` with an unsafe, unlisted or `too_large` path, empty text, text over 200,000 characters or text containing NUL (`details.issues[] { path, reason: unsafe \| unknown \| too_large \| empty \| too_long \| nul }`; nothing is changed); body over the contract limits |
| 502 | git failed: `listFiles` or `showFile` threw (for example `listFiles: ref not found`) |

## Invariants

1. **Discovery reads the object database of the default branch.**
   `ProjectContextService.listing` calls `GitClient.listFiles(repo,
   repo.defaultBranch, globToPathspecs(glob))`; `SimpleGitClient.listFiles`
   resolves `refs/remotes/origin/<ref>` then `refs/heads/<ref>` with `rev-parse`
   and lists blobs with `ls-tree -r -l -z --full-tree`. The working tree is never
   read. Pinned: `test/adapters.test.ts` (real temp repo), `test/project-context-service.test.ts`.
2. **The adapter matches the globs itself.** `ls-tree` rejects `:(glob)`
   pathspec magic, so `listFiles` lists every blob once and filters with
   `globToRegExp` (`**/` is zero or more folders, `*` and `?` stay in one
   segment). Pinned: `test/adapters.test.ts`.
3. **Unsafe refs never reach git.** `isSafeRef` rejects an empty ref, a leading
   `-`, `..`, characters outside `[A-Za-z0-9._/-]` and more than 200 characters
   before any spawn. Pinned: `test/adapters.test.ts`.
4. **Exclusions and kind are computed from the path.** `isExcludedPath` drops
   `node_modules`, any dot segment, control characters and paths failing
   `isSafePath`; `kindOf` is the nearest ancestor segment among `specs`, `docs`,
   `insights`. Pinned: `test/project-context-helpers.test.ts`.
5. **The listing is cached per head sha.** `ProjectContextService.cache` keeps
   the latest listing per repo under the key `repoId:sha:glob`; token counts only,
   no text. `listFiles` itself runs on every request (it resolves the sha), blob
   reads only on a miss; `?refresh=true` forces a miss. The cache lives in the
   service, which the container owns as a singleton. Pinned:
   `test/project-context-service.test.ts`.
6. **Only listed, attachable paths are stored.** `validateAttachPaths` rejects
   duplicates, unlisted and `too_large` paths with a 422 before any write.
   Pinned: `test/project-context.it.test.ts`, `test/project-context-routes.test.ts`.
7. **An agent's list is versioned like its skills.** `AgentsRepository.setContext`
   compares the stored list with the new one; an identical list is a no-op,
   otherwise it replaces the rows, bumps `agents.version` and snapshots the
   config in the same transaction. A skill's list (`ProjectContextRepository.setSkillPaths`)
   writes no `skills.version` and no `skill_versions` row. Pinned:
   `test/project-context.it.test.ts`.
8. **Every query is workspace-scoped.** Each service and repository method
   takes `workspaceId`; an agent, skill or repo of another workspace answers
   404. Pinned: `test/project-context.it.test.ts`.
9. **Run resolution never throws.** `ProjectContextService.resolveForRun`
   catches everything and logs `Context skipped: ...`; the executor also
   catches the call and uses `runLog.info`, never `runLog.step`. A context
   failure never marks a run `failed`. Pinned: `test/project-context-run.it.test.ts`.
10. **A long unspaced run is counted by approximation.** `safeTokenCount` falls
    back to `ceil(length / 4)` when the text holds a whitespace-free run longer
    than 2,000 characters, because the BPE tokenizer is quadratic on such text
    and a 200 KB attacker-written file would block the event loop. Every count in
    the service (listing, truncation, block tokens) goes through it. Pinned:
    `test/project-context-helpers.test.ts`.
11. **The prompt is byte-identical without documents.** With nothing attached
    (or everything skipped) the executor passes no `specs` and sets no
    `context_tokens` / `context_blocks`; with nothing attached it also writes no
    `Context` log line (skipped documents are still logged). Pinned:
    `reviewer-core/test/prompt.test.ts` (literal pre-change prompt),
    `test/project-context-run.it.test.ts`.
12. **An override is written only after the path is checked against the
    listing.** `ProjectContextService.saveFile` rejects an unsafe path
    (`isSafePath`), an unlisted or `too_large` one, and text that is empty,
    longer than 200,000 characters or holds NUL (`overrideTextIssue`) with a 422
    before any write; the route also caps the body (`OVERRIDE_BODY_LIMIT`).
    Pinned: `test/project-context-service.test.ts` (zero writes on a rejected
    save), `test/project-context-routes.test.ts` (NUL, a 4-byte character text
    of 200,000 characters).
13. **Identical text is not an override.** `saveFile` compares the text with the
    default-branch text read at the listed sha; equal text deletes the row and
    answers `modified: false`. The stored `sha` is the blob of the listing
    (`ListedFile.blob`, from `GitClient.listFiles`). Pinned:
    `test/project-context-service.test.ts`, `test/project-context.it.test.ts`.
14. **Overrides never enter the listing cache.** `list` merges
    `ProjectContextRepository.overrides` after the cached or fresh listing on
    every call, so a save or reset shows on the next listing. The token count of
    an override is memoised separately in `overrideTokens`, keyed `repoId:path`
    and holding the `updatedAt` it was counted for; a new save recounts, the
    entry is replaced in place. Pinned: `test/project-context-service.test.ts`
    (cache hit still merges; memo).
15. **An override of a path that is not listed is ignored and kept.** The
    listing, the attachment `missing` flag and `GET`/`DELETE` of the file all
    follow the listing; the row stays and applies again if the path returns.
    A `too_large` listed path never shows as `modified`. Pinned:
    `test/project-context-service.test.ts`, `test/project-context-run.it.test.ts`.
16. **Every override query is workspace-scoped.** `overrides`, `upsertOverride`
    (the conflict update has `setWhere` on `workspace_id`) and `deleteOverride`
    take `workspaceId`; a repository of another workspace answers 404. Pinned:
    `test/project-context.it.test.ts`.

## Listing (`GET /repos/:id/context`)

1. Repo lookup (404), clone check (409), `listFiles` at the stored default
   branch (502 on failure).
2. Cache hit: reuse the token counts. Miss: for each non-excluded file, `too_large`
   is decided from the `ls-tree` size without reading; the others are read with
   `showFile` at the listed sha (concurrency 8) and counted with the tokenizer
   (`container.tokenizer.count`); an unreadable blob is listed without `tokens`.
3. `usageCounts(workspace, repo)` is merged on every call, so `agent_count`,
   `skill_count` and `agents_using` are never stale. `agents_using` counts
   distinct *enabled* agents that receive the document at run time: those that
   attach it directly plus those linked (`agent_skills`) to an *enabled* skill
   that attaches it; `agent_count` and `skill_count` stay the raw link-row
   counts regardless of enabled state.
4. `overrides(workspace, repo)` is merged on every call too (one query). A
   listed, not `too_large` path with an override gets `modified: true` and the
   tokens of the override text; overrides of unlisted paths are ignored.

## Run resolution (`ReviewRunExecutor` → `resolveForRun`)

After the skill blocks, `runOneAgent` calls
`ProjectContextResolverPort.resolveForRun(workspaceId, { repoId, baseBranch:
pull.base, agentId, skills (enabled links in link order), log })`:

1. Order: the agent's paths in stored order, then each enabled skill's paths in
   link order; a path already seen is skipped (`resolveContextOrder`), so the
   first owner is the block `source` (`agent` or `skill:<name>`). A disabled
   skill contributes nothing. Attachments of another repo are ignored.
2. Read: `listFiles` at `pull.base` (the document is read at the PR's **base**
   branch, never the head, so a PR cannot rewrite its own rules), then `showFile`
   at the sha that listing resolved. Skipped with a log line and no failure when:
   no clone, base branch not in the clone, path not at the base, over the size
   cap, read error, or text containing NUL or U+FFFD (`isProbablyBinary`).
   Overrides of the resolved paths are read once, at run start (a save during
   the run applies to the next run). A path with an override takes the
   override text instead of the blob (no `showFile`, no binary check: it is DB
   text); the path must still be listed at the base branch and under the size
   cap, otherwise it is skipped as above. The override applies whatever the
   PR's base branch.
3. Cut: a document above 8,000 tokens is truncated (`truncateToTokens`, binary
   search on length; no marker inside the prompt), the block is `truncated` and
   `Context truncated: <path> to 8000 tokens` is logged.
4. Budget: `applyPromptBudget` keeps documents in order until one would take the
   summed block tokens above 24,000; that document and every later one are
   skipped, one `Context skipped:` line per path. The budget counts the document
   tokens, not the wrapper text.
5. Log: one `Context attached: <path> (<tokens> tokens, <source>)` per kept
   document, with `, modified locally` before the closing parenthesis when the
   text came from an override, and `Context: <n> document(s), <t> tokens`.
   Nothing is logged when nothing is attached.

An override text goes through the same cut, budget, log lines and
`wrapUntrusted` as repository text; a local edit lifts neither the caps nor the
injection guard.

The kept blocks go to `reviewPullRequest` as `specs: [{ path, text }]`. They are
resolved once per agent run; in a map-reduce run the same blocks are rendered
into every chunk prompt, so the added input tokens repeat per chunk (as skill
blocks do). No LLM call is added.

## Trace contract

`RunTrace.prompt_assembly` gains (`contracts/trace.ts`):

| Field | Meaning |
|---|---|
| `context_tokens` | tokenizer count of `prompt_assembly.specs`, the whole rendered `## Project context` block |
| `context_blocks[]` | `PromptContextBlock { path, tokens, text, truncated, source, modified }`, in prompt order; `tokens` counts the (possibly truncated) text; `modified` (boolean, nullish in traces written before the increment) is true when the text came from an override |

Both are absent when no document went in. `RunTrace.specs_read` stays
`string[]`: the PR intent refs first, then the attached paths that went into the
prompt. Both contract changes are copied to `client/src/vendor/shared`.

## Module shape

`constants.ts` · `helpers.ts` (pure: braces, exclusion, kind, validation, order,
truncation, budget, log lines, `overrideTextIssue`, `safeTokenCount`) · `ports.ts`
(`ProjectContextRepositoryPort`, `OverrideDto`, structural ports for agents,
skills and repos, `ProjectContextDeps`) · `service.ts` (`readFile`, `saveFile`,
`resetFile` next to the listing and `resolveForRun`) · `repository.ts` (skill
links, usage counts, overrides) · `routes.ts` (Zod schemas, `getContext`
first). Agent link writes live in `AgentsRepository` (`contextPaths`,
`setContext`) because the version bump and snapshot share one transaction.
`GitClient.listFiles` is part of the `@devdigest/shared` adapter interface,
with a mock in `adapters/mocks.ts`; it answers `{ sha, files: { path, size,
blob }[] }`, where `blob` is the git blob sha of each file (taken from
`ls-tree`) and is what an override records as its base.
The reviews module sees the service through the structural
`ProjectContextResolverPort` (`modules/reviews/ports.ts`), passed as the third
argument of `ReviewService`.

## Known limits

- A PR whose base branch is not the branch the clone holds (clones are depth 1,
  single branch) has all its context skipped with one logged reason per path.
- A repo whose stored default branch is absent from the clone (a seeded repo
  whose clone is `master` while the row says `main`) answers the listing with a
  502 `listFiles: ref not found`; the page shows its error state.
- The refresh rate limit (10 per minute on `?refresh=true`) is absent under
  `NODE_ENV=test` and is not covered by a test.
- A cold listing spawns two git processes per file (size is taken from
  `ls-tree`, text from `showFile`); there is no batched `cat-file` read.
- `run-executor.ts` counts `context_tokens` over the rendered block with the
  plain tokenizer; its input is bounded by the per-document cut.
- An override keeps winning after the repository text changes: the stored `sha`
  is recorded but not compared, there is no stale-override warning and no
  merge. `repo_text` on the file read shows the current repository text.
- The override token memo (`overrideTokens`) is per API process and holds one
  entry per (repository, path) that was listed with an override.
- Last save wins: there is no concurrent-edit check between two browser tabs.

## Tests

| File | Covers |
|---|---|
| `test/project-context-helpers.test.ts` | braces, exclusion, kind, validation, order, truncation, budget, `safeTokenCount`, `overrideTextIssue`, log suffix |
| `test/project-context-service.test.ts` | listing cache hit / new sha / refresh, `too_large`, binary, no clone, base branch missing, override save / identical text / reset, merge on a cache hit, token memo, orphan and `too_large` overrides, zero writes on a rejected save (in-memory fakes) |
| `test/project-context-routes.test.ts` | route shapes, 404 / 409 / 422 envelopes (`MockGitClient`), `PUT` / `DELETE` of the file (NUL, 200,000 four-byte characters) |
| `test/project-context.it.test.ts` | link tables, 422, no-op `PUT`, version bump and snapshot, skill without bump, cascades, usage counts, workspace scoping; override row shape, upsert, identical-text delete, reset, cascade, other-workspace 404 (Testcontainers) |
| `test/project-context-run.it.test.ts` | order, disabled skill, base-branch sha, truncation, budget, skips, log lines, byte-identical prompt, finding naming the document persists; override text under `<untrusted source>`, truncated override, escaped `</untrusted>`, `modified: true`, orphan override ignored and kept |
| `test/adapters.test.ts` | `listFiles` on a real temp repo (blob sha equals `rev-parse`), unsafe refs, `loadConfig` glob default, cap equality |
| `test/contracts.test.ts` | `SpecFile`, `PromptContextBlock` (an old trace still parses), `ContextFileContent` |
