# Plan: Project context (manual attachment) · branch feat/project-context

Design-system task: yes
Design-system scope: one `NAV` entry in `client/src/vendor/ui/nav.ts` only (AC-8 nav entry, user-approved exception D4); no other `vendor/ui` file changes. New cross-page pieces go to `client/src/components/` and `/showcase` (row 44).
Execution mode: multi-agent
Requirements source: specs/project-context.md (SPEC-01, draft; user accepted the spec and its revision of AC-22, AC-34, the constants line and the NFR cost bullet; proceed)

Status: READY. All four planning questions are answered (the user chose the default for each); `spec-creator` revised the spec accordingly; no open question blocks implementation.

## Requirements review

Verified against the code (all `path:line` as of 45ce9a0):
`reviewer-core/src/prompt.ts:16` (INJECTION_GUARD), `:30` (wrapUntrusted, label not escaped), `:83` (`specs?: string[]`), `:136-139` (label `spec-${i}`), `:162-170` (slot after Repo skeleton, before Callers); `reviewer-core/src/review/run.ts:60,136` (specs passthrough), `:147-175` (one assembly per chunk); `server/src/vendor/shared/contracts/trace.ts:41-69` (PromptSkillBlock, PromptAssembly.specs), `:104` (specs_read: string[]); `contracts/platform.ts:270-276` (SpecFile path/content/size/updated_at); `client/src/lib/hooks/core.ts:123-137` (useContextFiles → `GET /repos/:id/context`, useReindexContext → a non-existent `/context/reindex`); `client/messages/en/shell.json:20` (nav label "Project Context") but `client/src/vendor/ui/nav.ts:21-36` has no entry; `client/src/lib/repo-context.tsx:46-49` (active repo: URL > localStorage > first); `server/src/modules/agents/repository.ts:152-176,311-338` (snapshotVersion, setSkills); `server/src/adapters/git/simple-git.ts:133-153` (showFile sha-only, SHOW_FILE_MAX_CHARS=200_000 by bytes, isSafeRepoPath, both module-private); `server/src/platform/container.ts:203` (tokenizer, `count` only, `adapters/tokenizer/index.ts:16`); `server/src/modules/reviews/helpers.ts:117` (skillBlocksForTrace); no `/repos/:id/context` route in `server/src/modules/**`; clones are depth 1 (`server/src/modules/repos/constants.ts:9`).

| Id | Requirement (spec words, abridged only where marked …) | Verdict | Evidence | Covered by |
|---|---|---|---|---|
| AC-1 | `GET /repos/:id/context` returns Markdown files at the default branch matching the glob, each as `SpecFile` extended with `kind` and `tokens` | OK | no route today; `platform.ts:270` | rows 1, 10, 16–20 · `project-context-routes.test.ts` |
| AC-2 | discovery glob from one server setting, default `**/{specs,docs,insights}/**/*.md` | OK → D2 names it | `platform/config.ts:15-39` (env pattern) | rows 8, 16 · helpers test |
| AC-3 | exclude `node_modules/` and any dot-folder | OK | — | row 16 (`isExcludedPath`) · helpers test |
| AC-4 | `kind` = nearest ancestor segment among specs, docs, insights | OK | — | row 16 (`kindOf`) · helpers test |
| AC-5 | `tokens` via `container.tokenizer.count` over the text | OK | `container.ts:203` | rows 18, 21 · service test |
| AC-6 | file over `PROJECT_CONTEXT_FILE_MAX_CHARS` listed `too_large`, no `tokens`, attach → 422 | OK → D8 (bytes) | `simple-git.ts:137-139` caps by bytes | rows 1, 16, 18 · service + it test |
| AC-7 | list through a new `GitClient` method over the object DB of the default branch; cache per head sha | OK → D14 | `adapters.ts:212-241` | rows 3, 10, 11, 18 · `adapters.test.ts` |
| AC-8 | Project Context page: repo selector, list (path, kind, tokens, used by N agents / skills), read-only Markdown preview; new route and nav entry | OK (nav entry in `vendor/ui/nav.ts` approved by the user, D4) | `nav.ts:21`; `client/INSIGHTS.md` 2026-09-25 nav exception | rows 34–36, 43 · `ProjectContextView.test.tsx`, e2e 14 |
| AC-9 | selected document text through a new route via `showFile` at default-branch head, same path rules | OK | `simple-git.ts:133-136` | rows 18, 20 · routes test |
| AC-10 | refresh control re-lists and bypasses the cache | OK → D14 | stale `useReindexContext` `core.ts:131` | rows 18, 20, 31 · service + view test |
| AC-11 | no matching file → empty state naming the roots | OK | — | row 35 · view test |
| AC-12 | no clone / listing failure → error state with retry; API uses the standard envelope | OK → D17 | `platform/errors.ts:31,37` | rows 18, 35 · routes test, view test |
| AC-13 | per (repo, agent) ordered paths in a new link table, no text | OK | — | rows 12, 13, 14 · it test |
| AC-14 | per (repo, skill) ordered paths in a new link table, no text | OK | — | rows 12, 13, 19 · it test |
| AC-15 | `GET /agents/:id/context?repo_id=` → stored order + `missing` | OK | — | rows 1b, 18, 20 · it test |
| AC-16 | `PUT /agents/:id/context {repo_id, paths}` replaces list; each path once, listed and attachable, else 422; returns stored list | OK | — | rows 16, 18, 20 · it + routes test |
| AC-17 | changed content/order bumps `agents.version` + `agent_versions` snapshot in one tx, as `setSkills`; identical list no-op | OK → D9 (snapshot shape) | `agents/repository.ts:311-338` | row 14 · it test |
| AC-18 | `GET`/`PUT /skills/:id/context` same shapes; no `skills.version` bump, no `skill_versions` row | OK | — | rows 17–20 · it test |
| AC-19 | link row deleted with its agent, skill or repo | OK (FK cascade) | `agents.ts:41-43` pattern | row 12 · it test |
| AC-20 | agent editor Context tab: repo selector, filter, rows (drag handle, checkbox, path, kind, tokens, Preview), badge "N of M attached", total-tokens footer | OK | `SkillsTab.tsx` pattern | rows 40–42 · `ContextAttachPanel.test.tsx` |
| AC-21 | skill editor Context tab "Project context to use", same rows, badge "N attached", inherit hint, block serialising as `## Project context` + one path line each | OK → D13 | `SkillEditor.tsx:84-91` | rows 41, 46 · panel test |
| AC-22 | repo selector defaults to the only repository, or, with several, to the app's active repository as the shell resolves it (URL, then localStorage, then the first repository) | OK (revised spec; D3) | `client/src/lib/repo-context.tsx:46-49` | row 32 · `client/src/lib/project-context.test.ts` |
| AC-23 | change saves through matching `PUT`, rollback + error toast on failure | OK | `hooks/skills.ts:100-123` optimistic pattern; toast via `providers.tsx` | rows 31, 41 · panel test |
| AC-24 | while checked total > `PROJECT_CONTEXT_RUN_MAX_TOKENS`, warning naming cap and total before saving | OK → D12 | — | rows 32, 41 · panel test |
| AC-25 | checked `missing` / `too_large` rows get a badge, not hidden | OK | — | rows 40, 41 · panel test |
| AC-26 | per listed document, count of agents and skills attaching it in the selected repo | OK → D11 (fields) | — | rows 1, 19, 18 · it test |
| AC-27 | run resolves agent paths, then each enabled linked skill in link order, first occurrence wins | OK | `run-executor.ts:203-207` linkedSkills | rows 16, 18, 26 · helpers + run it test |
| AC-28 | disabled skill contributes nothing | OK | `helpers.ts:121-123` same rule | rows 16, 26 · helpers test |
| AC-29 | read each document with `showFile` at the PR's base branch, not head | OK with limit → D7 | `showFile` needs a sha (`simple-git.ts:134`); `pull.base` is a branch name (`pulls.ts:19`); depth-1 clone | rows 10, 18 · run it test |
| AC-30 | non-empty list → texts passed as `specs`; rendered under `## Project context`, each `wrapUntrusted` with `source` = path | OK (contract change in reviewer-core) | `prompt.ts:136-139` uses `spec-${i}` | rows 5–7 · `prompt.test.ts`, run it test |
| AC-31 | slot stays after `## Repo skeleton`, before `## Callers of changed symbols` | DONE (already so; keep) | `prompt.ts:162-170` | row 5 · `prompt-callers.test.ts` (existing order test) |
| AC-32 | `INJECTION_GUARD` list names attached project documents | OK (user chose: named only when at least one document is attached, D5; keeps AC-36) | guard appended to every system prompt `prompt.ts:128` | row 5 · `prompt.test.ts` |
| AC-33 | doc over `PROJECT_CONTEXT_DOC_MAX_TOKENS` truncated, block `truncated`, log line | OK → D10 | tokenizer has `count` only | rows 16, 18 · helpers + run it test |
| AC-34 | doc that would take the prompt total above `PROJECT_CONTEXT_RUN_MAX_TOKENS` skipped with every later doc, log per path | OK (revised spec: prompt total; D6) | `run.ts:147-175` | rows 16, 18 · helpers + run it test |
| AC-35 | unreadable doc skipped with log (path, reason); run never `failed` because of context | OK | `server/INSIGHTS.md` 2026-10-06 (no `runLog.step` for best-effort pre-work) | rows 18, 26 · run it test |
| AC-36 | nothing resolves → prompt byte-identical to today; no `context_blocks`, `context_tokens`, `specs` | OK (D5 keeps the guard unchanged without documents) | `prompt.ts:136-139,165` omit when empty | rows 5, 26 · `prompt.test.ts`, run it test |
| AC-37 | no LLM call added | OK | — | row 26 · run it test (mock LLM call count unchanged) |
| AC-38 | log `Context attached: <path> (<tokens> tokens, <agent \| skill:name>)` per doc + one summary line | OK → D18 | `run-executor.ts:212` skill line pattern | rows 16, 18 · run it test |
| AC-39 | it test: prompt contains the doc under `<untrusted source="<path>">`; finding naming the path survives grounding and persists | OK | `server/test/skills.it.test.ts` pattern | row 52 |
| AC-40 | `PromptAssembly.context_tokens`, `context_blocks[] {path, tokens, text, truncated, source}` in server `trace.ts`, copied to client | OK | `trace.ts:41-69` | rows 2, 4 · `contracts.test.ts` |
| AC-41 | `specs_read` stays `string[]`, adds the attached paths that went in, after intent refs | OK | `run-executor.ts:338` | row 26 · run it test |
| AC-42 | drawer Prompt assembly: block "Project context — attached specs (untrusted)" with token total, one collapsible sub-block per doc (path, tokens, source, truncated), full text | OK | `TraceBody.tsx:76-94,108-110` skill pattern; `PromptBlock.tsx` collapsible | row 47 · `RunTraceDrawer.test.tsx` |
| AC-43 | Configuration section lists each `specs_read` doc that has a `context_blocks` entry with its tokens | OK | `TraceBody.tsx:39-51` | row 47 · drawer test |
| AC-44 | no `context_blocks` → no sub-blocks; Specs read shows intent refs or "none" | OK (today's behaviour) | `TraceBody.tsx:41-43` | row 47 · drawer test |
| EC-1 | PR edits an attached spec → base version read, drawer shows base text | OK | — | AC-29 · run it test |
| EC-2 | attached file renamed/deleted → "missing" badge, run skips + logs, succeeds | OK | — | AC-25, AC-35 |
| EC-3 | file > 200,000 chars → "too large", checkbox disabled; if attached, flagged and skipped | OK → D8 | — | AC-6, AC-35 · rows 40, 18 |
| EC-4 | one doc > 8,000 tokens → first 8,000 tokens, "truncated", log | OK | — | AC-33 |
| EC-5 | total > 24,000 → tab warns; run skips later docs + logs | OK | — | AC-24, AC-34 |
| EC-6 | same path on agent and skill / two skills → once, first position, first owner as `source` | OK | — | AC-27 · helpers test |
| EC-7 | agent attaches nothing, skill attaches docs → skill docs apply | OK | — | AC-27 · helpers test |
| EC-8 | attachments for repo A, PR in repo B → only B's | OK | — | AC-27 · run it test |
| EC-9 | text with `</untrusted>` or instructions → escaped, data | OK; plus label escaping TC-3 | `prompt.ts:32` escapes body only | row 5 · prompt test |
| EC-10 | two runs / run during re-sync → each reads its own base; listing keyed by head sha | OK | — | AC-7, AC-29 |
| EC-11 | no clone / Postgres or git down → page error + retry; runs log "Context skipped" and continue | OK | — | AC-12, AC-35 |
| EC-12 | non-UTF8/binary `.md` → skipped at run with log; listed without preview error | OK → D16 | — | rows 16, 18, 35 |
| EC-13 | skill disabled → its docs not in prompt | OK | — | AC-28 |
| EC-14 | run cancelled mid-flight → as today | OK | `run-executor.ts:250-252` | no new code |
| EC-15 | zero documents anywhere → prompt byte-identical | OK | — | AC-36 |
| EC-16 | double submit of the same `PUT` → no-op, no bump | OK | `agents/repository.ts:320-322` | AC-17 · it test |
| EC-17 | keyboard: rows, checkboxes, Preview, reorder operable; up/down controls like the Skills tab | OK | `SkillsTab.tsx:128-143` | row 40 · panel test |
| NFR-1 | Cost: no model call is added. Added input tokens are bounded by `PROJECT_CONTEXT_RUN_MAX_TOKENS` per assembled prompt (per file chunk in map-reduce runs, where the same context repeats in every chunk, exactly as skill blocks do); the Context tab shows the total before the user runs anything. | OK (revised spec; D6) | `run.ts:147-175` | rows 6, 26, 41 |
| NFR-2 | ≤500 files listed in < 2 s warm; cold = one `ls-tree` + one blob read per file; run reads +< 1 s for 10 docs | OK (not load-tested; risk R2) | `showFile` = 2 git spawns per file | rows 10, 18 |
| NFR-3 | token counts approximate (`cl100k_base`, chars/4 fallback), labelled approximate in UI | OK | `tokenizer/index.ts:21-38` | rows 40b, 41 (i18n "≈") |
| NFR-4 | contents, paths untrusted; `isSafeRepoPath` rules before any git call; object DB only; no secret | OK | `simple-git.ts:149-153`, `server/INSIGHTS.md` 2026-10-06 showFile vs readFile | rows 10, 16, 18 · TC-3, TC-4 |
| NFR-5 | strings are next-intl keys; CSS variables; document row + token badge in `/showcase` | OK | `client/AGENTS.md` | rows 40, 40b, 44, 48 |
| NFR-6 | new tables workspace-scoped, via `pnpm db:generate`, no migrate on boot | OK | — | rows 12–13 |
| NFR-7 | reviewer-core stays pure: texts and paths as arguments, no I/O | OK | `reviewer-core/AGENTS.md` | rows 5–6 |

Requirements: 67 OK · 1 done (AC-31) · 0 unclear · 0 conflict · 0 infeasible · 0 gaps.

## Suggestions (optional)

- S1 Also discover root-of-package `INSIGHTS.md` files (kind `insights`). Why: this repo has no `insights/` folder; its insights are `server/INSIGHTS.md`, `client/INSIGHTS.md`, … (`git ls-files ':(glob)**/INSIGHTS.md'`). Status: declined.
- S2 Add `pull_requests.created_at` so AC-22 could use the most recently imported PR. Why: no import timestamp exists (`server/src/db/schema/pulls.ts:5-34`). Status: declined (AC-22 revised to the shell's active repo instead).

## Goal & acceptance criteria

The spec's criteria, verbatim, with their verification. Constants stated once in the spec: `PROJECT_CONTEXT_DOC_MAX_TOKENS` = 8,000 tokens per document; `PROJECT_CONTEXT_RUN_MAX_TOKENS` = 24,000 tokens per assembled prompt (per file chunk in map-reduce runs); `PROJECT_CONTEXT_FILE_MAX_CHARS` = 200,000 characters (equal to `SHOW_FILE_MAX_CHARS` in `adapters/git/simple-git.ts`); default discovery glob `**/{specs,docs,insights}/**/*.md`.

- [ ] AC-1 (US-1) · WHEN a client calls `GET /repos/:id/context` (new route), the system shall return the Markdown files of that repository at its default branch that match the configured discovery glob, each as a `SpecFile` (existing contract in `contracts/platform.ts`, extended (new fields) with `kind` and `tokens`). — verified by `server/test/project-context-routes.test.ts`, `server/test/project-context.it.test.ts`
- [ ] AC-2 (US-1) · The system shall read the discovery glob from one server setting (new) whose default is `**/{specs,docs,insights}/**/*.md`. — verified by `server/test/project-context-helpers.test.ts` (pathspecs from the default) and a `loadConfig` default/override case in `server/test/adapters.test.ts`
- [ ] AC-3 (US-1) · The system shall exclude files under `node_modules/` and under any dot-folder from discovery. — verified by `project-context-helpers.test.ts`, `adapters.test.ts` (real temp repo)
- [ ] AC-4 (US-1) · The system shall set `kind` to the nearest ancestor path segment that is one of `specs`, `docs`, `insights`. — verified by `project-context-helpers.test.ts`
- [ ] AC-5 (US-1) · The system shall compute `tokens` for each document with `container.tokenizer.count` over the document text. — verified by `project-context-service.test.ts` (fake tokenizer)
- [ ] AC-6 (US-1) · IF a matched file is larger than `PROJECT_CONTEXT_FILE_MAX_CHARS`, THEN the system shall list it with a `too_large` marker (new field), without `tokens`, and shall reject any attempt to attach it with a 422 error. — verified by `project-context-service.test.ts`, `project-context.it.test.ts`
- [ ] AC-7 (US-1) · The system shall list files through a new `GitClient` method (new) that reads the git object database of the default branch, and shall cache the listing per head sha of that branch. — verified by `adapters.test.ts` (`listFiles` on a temp repo), `project-context-service.test.ts` (second call does no blob reads; new sha re-reads)
- [ ] AC-8 (US-2) · WHEN the user opens the Project Context page (new route and nav entry), the page shall show the repo selector, the document list (path, `kind` tag, token count, "used by N agents / skills") and a preview of the selected document rendered as Markdown, read-only. — verified by `ProjectContextView.test.tsx`, `e2e/specs/14-project-context.flow.json`
- [ ] AC-9 (US-2) · WHEN the user selects a document, the system shall return its text through a new route (new) that reads it with `GitClient.showFile` at the default branch head and applies the same path-safety rules as `showFile`. — verified by `project-context-routes.test.ts` (unsafe path → 422, unknown → 404), `ProjectContextView.test.tsx`
- [ ] AC-10 (US-2) · WHEN the user presses the refresh control on the page, the system shall re-list the repository and bypass the per-head-sha cache. — verified by `project-context-service.test.ts`, `ProjectContextView.test.tsx`
- [ ] AC-11 (US-1) · IF the repository has no matching file, THEN the page shall show an empty state that names the discovery roots. — verified by `ProjectContextView.test.tsx`
- [ ] AC-12 (US-1) · IF the repository has no clone, or the listing fails, THEN the page shall show an error state with a retry control and the API shall answer with the standard `{ error: { code, message, details } }` envelope. — verified by `project-context-routes.test.ts`, `ProjectContextView.test.tsx`, e2e 14 (seeded repo has no clone)
- [ ] AC-13 (US-3) · The system shall store, per (repository, agent), an ordered list of repo-relative document paths in a new link table (new) and shall store no document text. — verified by `project-context.it.test.ts`
- [ ] AC-14 (US-4) · The system shall store, per (repository, skill), an ordered list of repo-relative document paths in a new link table (new) and shall store no document text. — verified by `project-context.it.test.ts`
- [ ] AC-15 (US-3) · WHEN a client calls `GET /agents/:id/context?repo_id=` (new), the system shall return the attached paths of that agent for that repository in stored order, each with a `missing` flag set when the path is no longer in the current listing. — verified by `project-context.it.test.ts`
- [ ] AC-16 (US-3) · WHEN a client calls `PUT /agents/:id/context` (new) with `{ repo_id, paths }`, the system shall replace the whole ordered list, require every path to appear once and match a listed, attachable document (422 otherwise), and return the stored list. — verified by `project-context.it.test.ts`, `project-context-routes.test.ts`
- [ ] AC-17 (US-3) · WHEN the stored agent list changes in content or order, the system shall bump `agents.version` and snapshot the list into `agent_versions` in one transaction, as `AgentsRepository.setSkills` does for skills; an identical list shall be a no-op. — verified by `project-context.it.test.ts`
- [ ] AC-18 (US-4) · WHEN a client calls `GET` or `PUT /skills/:id/context` (new) with the same shapes as AC-15 and AC-16, the system shall behave as for agents, except that a change shall not bump `skills.version` and shall not write a `skill_versions` row. — verified by `project-context.it.test.ts`
- [ ] AC-19 (US-3, US-4) · The system shall delete a link row when its agent, skill or repository is deleted. — verified by `project-context.it.test.ts`
- [ ] AC-20 (US-3) · The agent editor shall show a Context tab (new) with: a repo selector, a filter box, one row per listed document (drag handle, checkbox, path, `kind` tag, token count, Preview button), the badge "N of M attached", and a footer with the total tokens of the attached documents. — verified by `ContextAttachPanel.test.tsx`, `AgentEditor.test.tsx`
- [ ] AC-21 (US-4) · The skill editor shall show a Context tab (new) titled "Project context to use" with the same rows, the badge "N attached", the hint that agents using the skill inherit the documents, and a block that serialises as the heading `## Project context` followed by one path line per attached document. — verified by `ContextAttachPanel.test.tsx` (skill variant)
- [ ] AC-22 (US-3, US-4) · The repo selector shall default to the workspace's only repository, or, when there are several, to the app's active repository as the shell resolves it (URL, then localStorage, then the first repository). — verified by `client/src/lib/project-context.test.ts`, `ContextAttachPanel.test.tsx`
- [ ] AC-23 (US-3, US-4) · WHEN the user changes the checked set or the order, the tab shall save through the matching `PUT` and roll the change back with an error toast if the call fails. — verified by `ContextAttachPanel.test.tsx`
- [ ] AC-24 (US-7) · WHILE the summed `tokens` of the checked documents is above `PROJECT_CONTEXT_RUN_MAX_TOKENS`, the tab shall show a warning before the change is saved, naming the cap and the total. — verified by `ContextAttachPanel.test.tsx`
- [ ] AC-25 (US-7) · WHEN a checked document is `missing` or `too_large`, the tab shall mark its row with a "missing" or "too large" badge instead of hiding it. — verified by `ContextAttachPanel.test.tsx`
- [ ] AC-26 (US-2) · The system shall report, for each listed document, how many agents and skills attach it in the selected repository. — verified by `project-context.it.test.ts`
- [ ] AC-27 (US-5) · WHEN a run starts, the system shall resolve the document list for the PR's repository: the agent's attached paths in stored order, then, for each enabled skill linked to the agent in link order, that skill's attached paths in stored order, with a path that already appeared skipped (first occurrence wins). — verified by `project-context-helpers.test.ts`, `project-context-run.it.test.ts`
- [ ] AC-28 (US-5) · The system shall not include documents of a skill that is disabled. — verified by `project-context-helpers.test.ts`, `project-context-run.it.test.ts`
- [ ] AC-29 (US-5) · The system shall read each resolved document with `GitClient.showFile` at the PR's base branch, not the head sha. — verified by `project-context-run.it.test.ts` (recording git double asserts the sha passed)
- [ ] AC-30 (US-5) · WHEN the resolved list is non-empty, the system shall pass the document texts to `reviewPullRequest` as `specs`, and `assemblePrompt` shall render them under `## Project context`, each wrapped by `wrapUntrusted` with `source` equal to the repo-relative path. — verified by `reviewer-core/test/prompt.test.ts`, `project-context-run.it.test.ts`
- [ ] AC-31 (US-5) · The system shall keep the `## Project context` slot at its current position, after `## Repo skeleton` and before `## Callers of changed symbols`. — verified by `server/test/prompt-callers.test.ts`, `reviewer-core/test/prompt.test.ts`
- [ ] AC-32 (US-5) · The system shall include attached project documents in the `INJECTION_GUARD` list of untrusted content in `reviewer-core/src/prompt.ts`. — verified by `reviewer-core/test/prompt.test.ts` (guard names them when at least one document is attached, D5)
- [ ] AC-33 (US-7) · IF a document exceeds `PROJECT_CONTEXT_DOC_MAX_TOKENS`, THEN the system shall truncate its text to that limit, mark the block `truncated`, and write a run log line naming the path. — verified by `project-context-helpers.test.ts`, `project-context-run.it.test.ts`
- [ ] AC-34 (US-7) · IF adding a document would take the prompt total above `PROJECT_CONTEXT_RUN_MAX_TOKENS`, THEN the system shall skip it and every later document and write a run log line naming each skipped path. — verified by `project-context-helpers.test.ts`, `project-context-run.it.test.ts`
- [ ] AC-35 (US-7) · IF a resolved document cannot be read (missing at the base branch, over the size cap, no clone, read error), THEN the system shall skip it, write a run log line with the path and the reason, and continue the run; a context failure shall never mark the run `failed`. — verified by `project-context-run.it.test.ts`, `project-context-service.test.ts`
- [ ] AC-36 (US-5) · WHERE no document resolves for the run (no attachments, or all skipped), the system shall produce a prompt byte-identical to the prompt produced without this feature and shall set no `context_blocks`, `context_tokens` or `specs` value. — verified by `reviewer-core/test/prompt.test.ts` (literal expected string captured before the change), `project-context-run.it.test.ts`
- [ ] AC-37 (US-5) · The system shall add no LLM call for reading, selecting or summarising documents. — verified by `project-context-run.it.test.ts` (mock LLM call count)
- [ ] AC-38 (US-5) · WHEN a run reads documents, the system shall write one run log line per document `Context attached: <path> (<tokens> tokens, <agent | skill:name>)` and one summary line with the document count and total tokens. — verified by `project-context-run.it.test.ts`
- [ ] AC-39 (US-5) · WHEN an agent with an attached document stating "module `api/` does not import `db/` directly" reviews a PR whose diff violates it, the finding shall be able to cite that document: an integration test using the mock LLM shall assert that the prompt contains the document under `<untrusted source="<path>">` and that a finding naming the path survives grounding and is persisted. — verified by `project-context-run.it.test.ts`
- [ ] AC-40 (US-6) · The system shall add to `PromptAssembly` (new fields) `context_tokens` (integer, tokenizer count of the whole `## Project context` block, nullish) and `context_blocks[]` of `{ path, tokens, text, truncated, source }` where `source` is `'agent'` or `'skill:<name>'`, mirroring `skill_blocks`; the change shall be made in `server/src/vendor/shared/contracts/trace.ts` and copied to the client copy. — verified by `server/test/contracts.test.ts`, TC-1
- [ ] AC-41 (US-6) · The system shall keep `RunTrace.specs_read` as `string[]` and shall list in it the attached paths that went into the prompt, in addition to the existing intent refs. — verified by `project-context-run.it.test.ts`
- [ ] AC-42 (US-6) · WHEN the user opens the run drawer, the Prompt assembly section shall show the block "Project context — attached specs (untrusted)" with its token total, and one collapsible sub-block per document labelled with the path, its token count, its source and a "truncated" mark where applicable, each openable to the full text sent to the model. — verified by `RunTraceDrawer.test.tsx`
- [ ] AC-43 (US-6) · WHEN the user opens the run drawer, the Configuration section shall list each document of `specs_read` that has a `context_blocks` entry together with its token count. — verified by `RunTraceDrawer.test.tsx`
- [ ] AC-44 (US-6) · WHERE a run has no `context_blocks`, the drawer shall show no Project context sub-blocks and the Specs read row shall show only the intent refs, or "none" when there are none. — verified by `RunTraceDrawer.test.tsx`
- [ ] TC-1 Contract copies identical for every touched shared file (`platform.ts`, `trace.ts`, `project-context.ts`, `adapters.ts`, `index.ts`). — verified by `verify.sh` contract-copy precheck (`diff -r` on touched files)
- [ ] TC-2 `pnpm lint:arch` green with no new baseline entries; `.dependency-cruiser-known-violations.json` unchanged. — verified by `verify.sh run`
- [ ] TC-3 `wrapUntrusted` escapes `&`, `"`, `<`, `>` and line breaks in the `source` label, so a crafted file name cannot close the attribute; output for the existing fixed labels is unchanged. — verified by `reviewer-core/test/prompt.test.ts`, `server/test/prompt-structured.test.ts`
- [ ] TC-4 `GitClient.listFiles` rejects unsafe refs (leading `-`, `..`, characters outside `[A-Za-z0-9._/-]`) before any git spawn and only reads the object DB. — verified by `adapters.test.ts`
- [ ] TC-5 Every module query takes `workspaceId`; `GET`/`PUT` for an agent, skill or repo of another workspace answers 404. — verified by `project-context.it.test.ts`
- [ ] TC-6 `PROJECT_CONTEXT_FILE_MAX_CHARS` equals the adapter cap (`SHOW_FILE_MAX_CHARS`, given a named export in `simple-git.ts` for the test). — verified by `adapters.test.ts`

## Out of scope

- Everything under the spec's Non-goals (automatic selection, editing/uploading docs, coverage gauge and index footer, per-repo glob override, non-Markdown, findings contract change, extra LLM call, MCP tool, PR-head reads).
- Discovering `INSIGHTS.md` files outside an `insights/` folder (S1 declined) and a PR import timestamp (S2 declined).
- Fetching a non-default base branch into the depth-1 clone. A PR whose base is not the clone's branch has its context skipped with a logged reason (D7).
- Spec and docs updates (`server/specs/project-context.md`, `client/specs/pages.md`, `server/README.md` API map, `reviewer-core/specs/review-contract.md`, `reviewer-core/docs/pipeline.md`, `server/specs/skills.md` cross-link, `e2e/specs/flows.md`, flipping SPEC-01 to `implemented`): `doc-writer` after implementation.
- The `IndexStatus` contract stays (unused by this feature).

## Relevant INSIGHTS

- `server/INSIGHTS.md` 2026-10-06 — best-effort pre-work in `ReviewRunExecutor` must not use `runLog.step` (a throw toasts) → row 26: context resolution never throws, logs with `runLog.info`.
- `server/INSIGHTS.md` 2026-10-06 — read sha-pinned content with `GitClient.showFile`, never `readFile` (working tree, traversal-prone) → rows 10, 18.
- `server/INSIGHTS.md` 2026-09-25 — `setSkills` bumps version + snapshots in one transaction, identical set is a no-op → row 14 copies it for context.
- `server/INSIGHTS.md` 2026-09-26 — sibling capabilities come from the container, typed structurally in `ports.ts` → rows 17, 21, 23.
- `server/INSIGHTS.md` 2026-09-26 — grep shared contracts for a new name before adding it (TS2308) → row 1 (grep done for `ContextBlock`, `ContextDoc`, `ProjectContext`, `AgentContext`, `SkillContext`: no hit; implementer re-greps `ContextAttachment`, `ContextFileContent`, `SpecKind`).
- `server/INSIGHTS.md` 2026-10-06 — IT tests must override secrets, github and llm.openrouter, and wait with `waitForPrRuns` (trace written after status) → row 52.
- `client/INSIGHTS.md` 2026-09-25 — `vendor/ui/nav.ts` edits are a user-approved exception; further nav changes go there → row 43 (approved for this feature).
- `client/INSIGHTS.md` 2026-09-26 — import only `type` from `@devdigest/shared`; mirror runtime values (caps, kinds) locally → rows 32, 40.
- `client/INSIGHTS.md` 2026-10-06 — mutations already toast globally; do not add a second error surface → rows 31, 41.
- `client/INSIGHTS.md` 2026-10-06 / 2026-10-12 — deep relative imports into `src/lib` are an ESLint error (use `@/`); do not extend the hooks barrel → rows 31, 33, 35, 41.
- `client/INSIGHTS.md` 2026-09-26 — a static page whose client view calls `useSearchParams` needs `<Suspense>` in `page.tsx` → row 34.
- `reviewer-core/INSIGHTS.md` 2026-09-25 — no keyword scanning for injection; `INJECTION_GUARD` is the defense → row 5.

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| no-cross-module (6) | project-context ↔ agents, skills, repos, reviews | `container.projectContext` and `container.agentsRepo` / `skillsRepo` / `reposRepo` injected in the container and routes; structural ports in `project-context/ports.ts` and `reviews/ports.ts` (`ProjectContextResolverPort`) |
| application-no-container (3) | `project-context/service.ts` | constructor takes `ProjectContextDeps`; built in `container.ts` (singleton for the cache) |
| application-no-row-types (4) | service, helpers | repository returns plain DTOs (`{ path, order }`, counts) |
| routes-no-persistence (1) | `project-context/routes.ts` | calls the service only |
| drizzle-only-in-driven-ring (2) | link-table queries | `project-context/repository.ts`, `agents/repository.ts` only |
| application-no-fastify (8) | service, ports | `refresh` flag and ids passed as plain values |
| adapters-no-modules (5) | `simple-git.ts` | `listFiles` is generic (ref + pathspecs); glob expansion and exclusions stay in module helpers |
| shared-is-a-leaf (7) | new contracts | `contracts/project-context.ts` imports zod only |
| reviewer-core-boundary | reviewer-core types | only `modules/reviews/**` and platform import reviewer-core; project-context declares its own block DTO and reviews maps it to `ProjectContextDoc` |
| baseline | `run-executor.ts` (already baselined for container/rows) | new code uses the injected port, adds no new edge; no baseline change |
| reviewer-core purity | `prompt.ts`, `run.ts` | receives `{ path, text }[]`, no I/O |
| client placement | 3 routes share row/panel | cross-page pieces in `src/components/<kebab>/`; hooks in `src/lib/hooks/project-context.ts`; topic helpers in `src/lib/project-context.ts`; route views in `_components/<Name>/` (≤ 2 levels) |
| Do-not-touch | `vendor/ui/nav.ts`, `client/src/vendor/shared`, migrations | nav: one entry (user-approved, D4); client contracts only by copy; migration only via `pnpm db:generate` |

## Existing patterns to follow

- New server module with ports/repository/service/routes → copy `server/src/modules/blast/*` (`blast/routes.ts:14-27`) and `modules/skills/ports.ts:47-75`.
- Container getter + override → `server/src/platform/container.ts:151-153` (`blastRepo`), service singleton → `:165-167` (`skillsService`).
- Versioned link replace in one tx → `server/src/modules/agents/repository.ts:311-338` (`setSkills`), snapshot → `:152-176`.
- Link table schema with cascades and order → `server/src/db/schema/agents.ts:51-63` (`agent_skills`).
- Best-effort run enrichment + log lines → `run-executor.ts:200-220` (skills) and `:423-436` (repo map, catch → `runLog.info`).
- Trace sub-blocks → `contracts/trace.ts:41-55` (`PromptSkillBlock`), `reviews/helpers.ts:117-127`.
- Real-git adapter test → `server/test/adapters.test.ts:109-160`.
- Route test with fakes → `server/test/blast-routes.test.ts`; DB IT → `server/test/skills.it.test.ts`, `server/test/blast.it.test.ts`; run IT helpers → `server/test/helpers/runs.ts` (`waitForPrRuns`).
- Attach/reorder tab with optimistic save → `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/{SkillsTab.tsx,helpers.ts,SkillsTab.test.tsx}`, `client/src/lib/hooks/skills.ts:100-123`.
- Active repo resolution → `client/src/lib/repo-context.tsx` (`useActiveRepo`).
- Page with repo + states → `client/src/app/conventions/_components/ConventionsView/ConventionsView.tsx:19-90` (use `@/` imports, not its legacy relatives).
- Markdown preview → `client/src/app/skills/[id]/_components/SkillEditor/_components/PreviewTab/PreviewTab.tsx` (`Markdown` from `@devdigest/ui`).
- Trace drawer blocks → `TraceBody.tsx:76-94` (skill blocks) and `:39-51` (Specs read).
- Showcase entry → `client/src/components/showcase/Showcase.tsx` (RunCostBadge group).
- e2e flow → `e2e/specs/13-pr-blast-radius.flow.json`.

## Work breakdown (ordered)

| # | Package | Module / ring | File (new/edit) | Change | Skills to apply | Test |
|---|---|---|---|---|---|---|
| 1 | server | vendor/shared · 0 | `src/vendor/shared/contracts/platform.ts` (edit) | `SpecFile` += `kind` (`SpecKind` enum specs/docs/insights, nullish), `tokens` (int nullish), `too_large` (bool nullish), `agent_count`, `skill_count` (int nullish) (D11); existing fields kept | zod, typescript-expert | `test/contracts.test.ts` |
| 1b | server | vendor/shared · 0 | `src/vendor/shared/contracts/project-context.ts` (new), `src/vendor/shared/index.ts` (edit) | `ContextAttachment { path, order, missing, too_large }`, `ContextAttachmentsUpdate { repo_id: uuid, paths: string[] (max 200, each 1..300) }`, `ContextFileContent { path, sha, text }`; export | zod, typescript-expert | `test/contracts.test.ts` |
| 2 | server | vendor/shared · 0 | `src/vendor/shared/contracts/trace.ts` (edit) | `PromptContextBlock { path, tokens, text, truncated: boolean, source: string /^(agent\|skill:.+)$/ }`; `PromptAssembly` += `context_tokens` (int nullish), `context_blocks` (array nullish) | zod, typescript-expert | `test/contracts.test.ts` |
| 3 | server | vendor/shared · 1 | `src/vendor/shared/adapters.ts` (edit) | `GitClient.listFiles(repo, ref, pathspecs): Promise<{ sha: string; files: { path: string; size: number }[] }>` with doc comment (ref = branch name, object DB only) | typescript-expert | — |
| 4 | client | vendor/shared copy | `client/src/vendor/shared/{contracts/platform.ts,contracts/trace.ts,contracts/project-context.ts,adapters.ts,index.ts}` (copy) | byte copy of rows 1–3, no hand edit | — | TC-1 precheck |
| 5 | reviewer-core | prompt | `src/prompt.ts` (edit) | `PromptParts.specs?: ProjectContextDoc[]` (`{ path, text }`), each wrapped `wrapUntrusted(path, text)`; `wrapUntrusted` escapes the label (TC-3); guard: `INJECTION_GUARD` text unchanged, plus a guard item naming "attached project documents" inserted in the guard's untrusted list only when `specs` is non-empty (D5); slot position unchanged | security, zod | `test/prompt.test.ts` |
| 6 | reviewer-core | review | `src/review/run.ts`, `src/index.ts` (edit) | `ReviewInput.specs?: ProjectContextDoc[]`, passed to every chunk assembly (D6); export type `ProjectContextDoc` | typescript-expert | `test/run.test.ts` (specs reach every chunk) |
| 7 | reviewer-core | tests | `test/prompt.test.ts` (edit) | AC-30/31/32/36, TC-3: path label, order, conditional guard item, byte-identical prompt without specs (literal expected string captured before the change) | — | itself |
| 8 | server | platform · root | `src/platform/config.ts` (edit) | env `PROJECT_CONTEXT_GLOB` → `AppConfig.projectContextGlob`, default `**/{specs,docs,insights}/**/*.md` (D2) | — | case in `test/adapters.test.ts` |
| 9 | server | tests | `test/prompt-callers.test.ts`, `test/prompt-structured.test.ts` (edit) | `specs` fixtures to `{ path, text }`; assert `<untrusted source="specs/security.md">` | — | themselves |
| 10 | server | adapters · 3a | `src/adapters/git/simple-git.ts` (edit) | `listFiles`: validate ref (TC-4); resolve `refs/remotes/origin/<ref>` then `refs/heads/<ref>` with `rev-parse --verify --quiet <x>^{commit}`; `ls-tree -r -l -z --full-tree <sha> -- :(glob)<p>…`; parse blobs only; throw `Error('listFiles: ref not found')`; named export `SHOW_FILE_MAX_CHARS` (TC-6) | security | `test/adapters.test.ts` |
| 11 | server | adapters · 3a | `src/adapters/mocks.ts` (edit) | `MockGitClient.listFiles` from `opts.files` (size = byte length, sha = `opts.head ?? 'a1b2c3d4'`), records calls; `showFile` records `(ref, path)` | — | used by rows 51–52 |
| 12 | server | db · 3a | `src/db/schema/project-context.ts` (new), `src/db/schema.ts` (edit) | `agent_context_docs` (`workspace_id`, `agent_id`, `repo_id`, `path`, `order`; PK agent_id+repo_id+path; FKs cascade; index repo_id) and `skill_context_docs` (same with `skill_id`) (NFR-6, AC-13/14/19) | drizzle-orm-patterns, postgresql-table-design | `project-context.it.test.ts` |
| 13 | server | db · generated | `src/db/migrations/00NN_*.sql` + `meta/` (generated) | `pnpm db:generate` only; never hand-edit; then `pnpm db:migrate` | drizzle-orm-patterns | it tests run migrations |
| 14 | server | agents · 3a | `src/modules/agents/repository.ts` (edit) | `contextPaths(workspaceId, agentId, repoId)`; `setContext(workspaceId, agentId, repoId, paths)` = `setSkills` shape (tx, compare, delete+insert with order, bump, snapshot); `snapshotVersion` adds `context: Record<repo_id, string[]>` read in the same exec (D9) | drizzle-orm-patterns, onion-architecture-backend | `project-context.it.test.ts`, `agents-versions.it.test.ts` stays green |
| 15 | server | project-context · 2 | `src/modules/project-context/constants.ts` (new) | `PROJECT_CONTEXT_DOC_MAX_TOKENS=8000`, `PROJECT_CONTEXT_RUN_MAX_TOKENS=24000` (per assembled prompt), `PROJECT_CONTEXT_FILE_MAX_CHARS=200_000`, `DISCOVERY_ROOTS`, `LIST_READ_CONCURRENCY=8`, `MAX_ATTACHED_PATHS=200`, `PROJECT_CONTEXT_MAX_TOKEN_RUN_CHARS=2_000` (fix round 1: longest whitespace-free run the tokenizer is allowed to see) | onion-architecture-backend | — |
| 16 | server | project-context · 2 | `src/modules/project-context/helpers.ts` (new) | pure: `expandBraces`, `globToPathspecs`, `isExcludedPath` (node_modules, dot segment, control chars, fails `isSafeRepoPath` rules), `kindOf`, `toSpecFile`, `validateAttachPaths` (dupes/unknown/too_large → issues list), `resolveContextOrder(agentPaths, skills[])` (AC-27/28, first wins, source), `truncateToTokens(text, max, count)` (binary search on length), `applyPromptBudget` (AC-34), `isProbablyBinary` (NUL or U+FFFD, D16), log line builders (AC-38); `safeTokenCount` guard: long whitespace-free text falls back to the chars/4 approximation so js-tiktoken cannot block the event loop (fix round 1, security finding) | onion-architecture-backend, security | `test/project-context-helpers.test.ts` |
| 17 | server | project-context · 1 | `src/modules/project-context/ports.ts` (new) | `ProjectContextRepositoryPort` (skill paths get/set, `usageCounts(ws, repoId)`, `skillPathsFor(ws, repoId, skillIds)`), structural `AgentContextPort` (`getById`, `contextPaths`, `setContext`), `SkillLookupPort` (`getById`), `RepoLookupPort` (`getById` → `{ id, owner, name, defaultBranch, clonePath }`), `ProjectContextDeps` (`repo, agents, skills, repos, git: Pick<GitClient,'listFiles'\|'showFile'>, tokenizer: { count }, glob`), `ContextLog`, `ResolvedContext` | onion-architecture-backend, typescript-expert | — |
| 18 | server | project-context · 2 | `src/modules/project-context/service.ts` (new) | `ProjectContextService`: `list(ws, repoId, { refresh })` (listFiles at default branch → cache key `repoId:sha:glob`, blob reads via `showFile` with concurrency cap, tokens, too_large without read, usage counts merged per call); `readFile(ws, repoId, path)` (must be in listing → else 404; `showFile` at sha); `get/setAgentContext`, `get/setSkillContext` (validate against listing, 422 `ValidationError` with details; 404 for foreign agent/skill/repo); `resolveForRun(ws, { repo, baseBranch, agentId, skills, log })` → `{ blocks, totalTokens }`, never throws (AC-29, 33–35, 38); no clone → `ConflictError('repo_not_cloned')`, git failure → `ExternalServiceError` (D17) | onion-architecture-backend, security | `test/project-context-service.test.ts` (in-memory fakes) |
| 19 | server | project-context · 3a | `src/modules/project-context/repository.ts` (new) | `ProjectContextRepository implements ProjectContextRepositoryPort`: skill link get/replace (one tx, no version), usage counts (two grouped queries scoped by workspace + repo), `skillPathsFor` | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend | `project-context.it.test.ts` |
| 20 | server | project-context · 3b | `src/modules/project-context/routes.ts` (new) | `GET /repos/:id/context?refresh=` (querystring boolean), `GET /repos/:id/context/file?path=` (`path` 1..300), `GET /agents/:id/context?repo_id=`, `PUT /agents/:id/context`, `GET /skills/:id/context?repo_id=`, `PUT /skills/:id/context` (body `ContextAttachmentsUpdate`); `getContext` first; response schemas; per-route rate limit (`max: 10/min`) on the listing route when `refresh=true` (D1) | fastify-best-practices, onion-architecture-backend, security | `test/project-context-routes.test.ts` |
| 21 | server | root | `src/platform/container.ts` (edit) | `projectContextRepo` getter typed as port + `ContainerOverrides.projectContextRepo`; `projectContext` service getter (singleton) built from repo, `agentsRepo`, `skillsRepo`, `reposRepo` (mapped to `RepoLookupPort`), `git`, `tokenizer`, `config.projectContextGlob` | onion-architecture-backend | routes test |
| 22 | server | driving | `src/modules/index.ts` (edit) | register `projectContext` | fastify-best-practices | `test/routes-smoke.test.ts` |
| 23 | server | reviews · 1 | `src/modules/reviews/ports.ts` (edit) | `ProjectContextResolverPort { resolveForRun(...) }` structural, block type `{ path, text, tokens, truncated, source }` | onion-architecture-backend, typescript-expert | — |
| 24 | server | reviews · 3b | `src/modules/reviews/routes.ts` (edit) | pass `container.projectContext` to `ReviewService` | fastify-best-practices, onion-architecture-backend | `reviews.it.test.ts` stays green |
| 25 | server | reviews · 2 | `src/modules/reviews/service.ts` (edit) | optional 3rd ctor arg forwarded to `ReviewRunExecutor` (`app.ts:84` reaper keeps working without it) | onion-architecture-backend | — |
| 26 | server | reviews · 2 | `src/modules/reviews/run-executor.ts` (edit) | after skills: `resolveForRun` with `pull.repoId`, `pull.base`, enabled skills in link order (`{ id, name }`); pass `specs` only when blocks exist; trace: `context_tokens` = `tokenizer.count(outcome.assembly.specs)`, `context_blocks`, `specs_read = [...intentRefs, ...paths]` (AC-36–41); no `runLog.step` | onion-architecture-backend | `project-context-run.it.test.ts` |
| 31 | client | lib · api | `src/lib/hooks/project-context.ts` (new) | `useContextFiles(repoId)` (key `["context", repoId]`), `useRefreshContext()` (GET `?refresh=true` → `setQueryData`), `useContextFile(repoId, path)`, `useContextAttachments(kind, ownerId, repoId)` and `useSetContextAttachments(kind)` with `kind: 'agent' | 'skill'` (one pair instead of four hooks; amended after review round 1 to match the implementation) (optimistic write + rollback, invalidate `["context", repoId]`, `["agent", id]`, `["agents"]`) | react-frontend-architecture | row 55, panel and view tests |
| 32 | client | lib · domain | `src/lib/project-context.ts` (new) + `src/lib/project-context.test.ts` (new) | mirrored caps and kinds (no runtime import from shared), `defaultContextRepoId(repos, activeRepoId)` (only repo, else the shell's active repo, D3), `sumCheckedTokens`, `isOverPromptCap`, `serializeContextBlock(paths)` (AC-21) | react-frontend-architecture | itself |
| 33 | client | lib · api | `src/lib/hooks/core.ts` (edit) | remove stale `useContextFiles` / `useReindexContext` (no callers; `/context/reindex` does not exist); keep the other hooks; do not extend `hooks/index.ts` | react-frontend-architecture | typecheck |
| 34 | client | route | `src/app/context/page.tsx` (new) | thin; `<Suspense>` around `ProjectContextView` (uses `useSearchParams` for `?repo=` and `?doc=`) (D21) | next-best-practices, react-frontend-architecture | — |
| 35 | client | route view | `src/app/context/_components/ProjectContextView/{ProjectContextView.tsx,styles.ts,helpers.ts,constants.ts,index.ts}` (new) | AppShell crumb, repo selector (default row 32), refresh button, list of `ContextDocumentRow` (read-only mode with "used by N agents / M skills"), selected doc preview with `Markdown` (read-only), empty state naming roots (AC-11), error state with retry (AC-12), not-cloned message | react-frontend-architecture, react-best-practices, next-best-practices | `ProjectContextView.test.tsx` |
| 36 | client | route view | `src/app/context/_components/ProjectContextView/ProjectContextView.test.tsx` (new) | AC-8–12 with mocked fetch | react-testing-library | itself |
| 40 | client | components | `src/components/context-document-row/{ContextDocumentRow.tsx,styles.ts,index.ts}` (new) | row: drag handle, checkbox (disabled when too large), path (text, never HTML), kind tag, `TokenBadge`, Preview button, up/down `IconBtn`s, "missing" / "too large" badges; read-only variant for the page | react-frontend-architecture, react-best-practices, security | via panel + view tests |
| 40b | client | components | `src/components/token-badge/{TokenBadge.tsx,index.ts}` (new) | "≈ N tokens" (approximate label, NFR-3) | react-frontend-architecture, react-best-practices | showcase smoke |
| 40c | client | components | `src/components/context-doc-preview/{ContextDocPreview.tsx,styles.ts,index.ts}` (new) | Modal with `Markdown` of `useContextFile` (Preview button in tabs) | react-frontend-architecture, react-best-practices | panel test |
| 41 | client | components | `src/components/context-attach-panel/{ContextAttachPanel.tsx,helpers.ts,styles.ts,constants.ts,index.ts,ContextAttachPanel.test.tsx}` (new) | shared body of both tabs: `owner: { kind: 'agent' \| 'skill', id, name }`; repo selector (default row 32), filter, merged rows (attached first in stored order, then the rest by path), drag + arrows reorder, toggle → PUT, rollback on error (global toast), badge "N of M attached" / "N attached", over-cap warning (AC-24), totals footer, skill variant hint + `## Project context` block (AC-21) | react-frontend-architecture, react-best-practices, react-testing-library | `ContextAttachPanel.test.tsx` |
| 42 | client | agents route | `src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts}` (edit), `_components/ContextTab/{ContextTab.tsx,index.ts}` (new), `AgentEditor.test.tsx` (edit) | `context` tab key in `TABS` (existing `IconName`), render `<ContextAttachPanel owner={{ kind: 'agent', … }} />` | react-frontend-architecture, react-best-practices | `AgentEditor.test.tsx` (tab renders) |
| 43 | client | design system (approved exception) | `src/vendor/ui/nav.ts` (edit) | one `NAV` item under WORKSPACE, below Pull Requests (moved from SKILLS LAB on the user's request after the gate): `{ key: "context", label: "Project Context", icon: <existing IconName>, href: "/context" }`; no gKey (avoids `g c` clash) (D4) | react-frontend-architecture | smoke test, e2e 14 |
| 44 | client | showcase | `src/components/showcase/Showcase.tsx` (edit) | "Project context" group: `ContextDocumentRow` (attached, missing, too large) and `TokenBadge` (NFR-5); then check `/showcase` in the browser | react-frontend-architecture, react-best-practices | `src/test/smoke.test.tsx` |
| 46 | client | skills route | `src/app/skills/[id]/_components/SkillEditor/{SkillEditor.tsx,constants.ts}` (edit), `_components/ContextTab/{ContextTab.tsx,index.ts}` (new) | `context` tab in `SKILL_TABS`/`VALID_SKILL_TABS`, render the panel with `kind: 'skill'` | react-frontend-architecture, react-best-practices | panel test (skill variant) |
| 47 | client | trace drawer | `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `RunTraceDrawer/constants.ts`, `RunTraceDrawer/RunTraceDrawer.test.tsx` (edit) | when `context_blocks`: block label "Project context — attached specs (untrusted)" · total `context_tokens`, then one `PromptBlock` per block (`↳ path · N tokens · source · truncated`); replaces the generic `specs` block when blocks exist; Specs read row shows `path · N tokens` for paths with a block, intent refs as today (AC-42–44) | react-frontend-architecture, react-best-practices, react-testing-library | `RunTraceDrawer.test.tsx` |
| 48 | client | i18n | `messages/en/context.json` (rewrite), `messages/en/agents.json`, `messages/en/skills.json`, `messages/en/runs.json` (edit) | all new strings as keys (`context.page.*`, `context.row.*`, `agents.context.*`, `skills.context.*`, `runs.trace.prompt.context*`); ICU plurals; `shell.json` already has `nav.context` | — | covered by component tests |
| 50 | server | tests | `test/project-context-helpers.test.ts`, `test/project-context-service.test.ts` (new); `test/adapters.test.ts`, `test/contracts.test.ts` (edit) | unit: rows 8, 10, 16, 18 (fakes for repo/git/tokenizer, cache hit/miss, refresh, too_large, binary, no clone, base ref missing) | — | themselves |
| 51 | server | tests | `test/project-context-routes.test.ts` (new) | `app.inject()` with `MockGitClient` + in-memory `projectContextRepo` override: 200 shapes, 404 unknown repo, 409 no clone envelope, 422 unsafe path / bad body | — | itself |
| 52 | server | tests | `test/project-context.it.test.ts`, `test/project-context-run.it.test.ts` (new) | Testcontainers: link tables, PUT 422/no-op/bump/snapshot, skill no bump, cascades, usage counts, workspace scoping; run: AC-27–30, 33–39, 41 with `MockGitClient` files + recording `showFile` sha, mock LLM fixture citing a diff line and naming the path, overrides for secrets/github/openrouter, `waitForPrRuns` | — | themselves |
| 53 | e2e | flows | `e2e/specs/14-project-context.flow.json` (new) | sidebar "Project Context" → page renders, seeded repo without clone shows the error state with retry; agent editor shows the Context tab | — | `./scripts/e2e.sh` |
| 54 | server | tests | `test/helpers/project-context.ts` (new) | in-memory fakes (repo, agents, skills, repos ports) shared by rows 51–52 (amended after review round 1, plan-verifier scope item) | — | used by rows 51–52 |
| 55 | client | lib · api | `src/lib/hooks/project-context.test.ts` (new) | optimistic write and rollback of `useSetContextAttachments` (AC-23) (amended after review round 1) | react-testing-library | itself |
| 56 | client | agents route | `src/app/agents/[id]/page.tsx` (edit) | `VALID_TABS` += `"context"` so the tab of row 42 is selectable from the URL (amended after review round 1) | react-frontend-architecture | `AgentEditor.test.tsx` |
| 57 | client | tests | `src/test/smoke.test.tsx` (edit) | wrap the showcase gallery in `NextIntlClientProvider`, assert the "Project context" group (row 44) (amended after review round 1) | react-testing-library | itself |
| 58 | e2e | docs | `e2e/README.md` (edit) | coverage row for flow 14, as `e2e/AGENTS.md` requires (amended after review round 1) | — | — |

(Row numbers skip 27–30, 37–39, 45 and 49 on purpose; no rows are missing. Rows 54–58 were added at review round 1 for files the implementer needed outside the original rows.)

## Contracts & migrations

- Contract changes: `SpecFile` (+`kind`, `tokens`, `too_large`, `agent_count`, `skill_count`), new `SpecKind`, `ContextAttachment`, `ContextAttachmentsUpdate`, `ContextFileContent` (new file `contracts/project-context.ts`), `PromptContextBlock`, `PromptAssembly.context_tokens`/`context_blocks`, `GitClient.listFiles` → copy to `client/src/vendor/shared` in row 4.
- Reviewer-core API change: `PromptParts.specs` / `ReviewInput.specs` from `string[]` to `ProjectContextDoc[]` (no external caller passes it today: `git grep` shows only `run.ts:136` and two server tests).
- Migration: tables `agent_context_docs`, `skill_context_docs` via `pnpm db:generate` (row 13), applied with `pnpm db:migrate`. No change to existing tables.

## Verification plan

| Package | Commands | Needs Docker |
|---|---|---|
| all touched | `bash .claude/skills/pr-self-review/scripts/verify.sh run --with-it --e2e`, then `verify.sh check` | yes |
| server | `pnpm exec vitest run project-context-helpers project-context-service project-context-routes adapters contracts prompt-` while building rows 8–26 | no |
| server | `pnpm exec vitest run project-context.it.test` (row 52, after row 13) and `pnpm exec vitest run project-context-run.it.test` | yes |
| server | `pnpm lint:arch` after rows 17–26 (TC-2) | no |
| reviewer-core | `npm test -- prompt run` after rows 5–7 | no |
| client | `pnpm exec vitest run ContextAttachPanel ProjectContextView RunTraceDrawer AgentEditor smoke project-context` (filter by file name, not by `[id]` path) | no |
| client | open `/showcase` and `/context` in the browser (design-system step for row 44) | no |

## Risks & open questions

- Resolved: Q1 → A (AC-22 revised: only repo, else the shell's active repo); Q2 → A (one `nav.ts` entry approved); Q3 → A (guard names project documents only when at least one is attached); Q4 → A (context in every map-reduce chunk; cap per assembled prompt, spec revised). No open question.
- R1 Depth-1 single-branch clones: a PR whose base is not the clone's branch skips all context with a logged reason (D7); the diff loader has the same limit.
- R2 Cold listing spawns two git processes per file (`cat-file -s` + `show`); with 500 files this can exceed 2 s cold (NFR-2 only bounds warm). Concurrency cap 8. A batched `cat-file --batch` read is a possible follow-up, not in scope.
- R3 In-memory cache is per API process; keep only the latest sha per repo to bound it.
- R4 `wrapUntrusted` label escaping changes output only for labels with `& " < >` or line breaks; intent source labels built from doc paths could change in such rare cases (acceptable, safer).
- R5 Map-reduce runs repeat up to 24,000 context tokens per file chunk (accepted by the user, NFR-1 revised); cost scales with chunk count as it already does for skills.
- No external facts needed (no researcher work).

## Decisions taken by default

- D1 Route names: `GET /repos/:id/context` (`?refresh=true` bypasses the cache), `GET /repos/:id/context/file?path=<repo-relative>`, `GET /agents/:id/context?repo_id=`, `PUT /agents/:id/context`, `GET /skills/:id/context?repo_id=`, `PUT /skills/:id/context`, all in new module `modules/project-context/`. Plural resource then id, snake_case JSON (root `AGENTS.md` naming). The stale client call to `POST /repos/:id/context/reindex` is removed, not implemented.
- D2 Glob setting: env `PROJECT_CONTEXT_GLOB` → `AppConfig.projectContextGlob`, default `**/{specs,docs,insights}/**/*.md`; one string, braces expanded in code into git `:(glob)` pathspecs (git globs do not expand braces).
- D3 (decided by the user, Q1 = A) Repo selector default: the only repo; with several, the shell's active repo (`useActiveRepo`: URL > localStorage > first); the page also honours `?repo=`.
- D4 (decided by the user, Q2 = A) One NAV entry in `vendor/ui/nav.ts` (WORKSPACE below Pull Requests, href `/context`, no gKey); `activeKeyFor` already maps `/context`.
- D5 (decided by the user, Q3 = A) `INJECTION_GUARD` unchanged; when `specs` is non-empty the guard's untrusted list also names "attached project documents (## Project context)".
- D6 (decided by the user, Q4 = A) Context goes into every map-reduce chunk, as skills do; `PROJECT_CONTEXT_RUN_MAX_TOKENS` bounds each assembled prompt. Resolution and budgeting run once per agent run; the same blocks feed every chunk.
- D7 "PR's base branch" = current tip of `origin/<pull.base>` (fallback `refs/heads/<pull.base>`) resolved by `listFiles` at run start; its sha is passed to `showFile`; listing at that sha also gives missing/size before reading.
- D8 Size cap measured in bytes from `ls-tree -l`, consistent with `showFile`'s cap; constant 200,000.
- D9 `agent_versions.config_json.context` = `{ [repo_id]: string[] }` (all repos, every snapshot), so any version replays its attachments.
- D10 Truncation cuts the text sent to the model (no marker inside the prompt); `truncated` is a trace field plus the log line.
- D11 "used by" counts travel on `SpecFile` as `agent_count` and `skill_count`.
- D12 AC-24 warning is inline and computed client-side before the `PUT` resolves; it does not block saving (the prompt cap enforces it, AC-34).
- D13 AC-21 block is a read-only `<pre>` preview in the skill tab; the skill body is not modified.
- D14 Cache in the `ProjectContextService` singleton keyed `repoId:sha:glob`, only the latest sha kept per repo; `listFiles` (rev-parse + ls-tree) runs on every request, blob reads only on a miss.
- D15 `wrapUntrusted` escapes the label (TC-3); discovery also drops paths with control characters.
- D16 Binary / non-UTF-8 = text containing NUL or U+FFFD; listed normally, preview renders whatever text exists, runs skip with reason "not UTF-8 text".
- D17 No clone → 409 `ConflictError` code `repo_not_cloned`; git failure → `ExternalServiceError` (502); unknown repo/agent/skill → 404; invalid paths → 422 `ValidationError` with `details.issues` per path.
- D18 No log lines when nothing is attached (keeps today's log); "Context skipped: <path> — <reason>" per skipped doc; one summary line when at least one path resolved.
- D19 Block `tokens` = tokenizer count of the (possibly truncated) document text; `context_tokens` = tokenizer count of `assembly.specs` (the whole rendered block).
- D20 Skill link writes live in `ProjectContextRepository` (no version to bump); agent link writes live in `AgentsRepository.setContext` because the version bump and snapshot must share its transaction.
- D21 Page route `/context` (not repo-scoped in the path) with `?repo=` and `?doc=` search params, so the selector and selection survive reload. *Superseded 2026-10-21 at the user's request: the page has no selector or Refresh of its own; it follows the sidebar repository (`useActiveRepo`), only `?doc=` remains, and `useShellContext.onSelectRepo` keeps the user on `/context` when the sidebar repo changes. Spec AC-8 and AC-10 revised accordingly.*

## Handoff

Multi-agent mode:
- Architecture review focus: `modules/project-context/*` ring placement and structural ports to agents/skills/repos; `container.ts` singleton; `run-executor.ts` adds no new baselined edge; `AgentsRepository.setContext` transaction + snapshot; `simple-git.ts listFiles` stays module-agnostic; client placement of the four `src/components/*` folders and the two `ContextTab` wrappers (≤ 2 `_components` levels); `vendor/ui/nav.ts` limited to one entry.
- Security review focus: path inputs (`?path=`, `PUT paths`) checked against the listing and `isSafeRepoPath` rules before any git call; ref validation in `listFiles` (no option injection, `--` before pathspecs); object DB only, never `readFile`; `wrapUntrusted` label escaping and body escaping for document text; conditional guard wording; Markdown preview renders no HTML/script; size and count caps (200 paths, 200k bytes, token caps); workspace scoping on every query; rate limit on refresh.
- plan-verifier: AC-22 default (only repo, else shell active repo); AC-36 byte-identity test (literal pre-change prompt); AC-17 no-op on identical PUT; AC-29 sha passed to `showFile` is the base, not head; AC-34 budget per assembled prompt; AC-39 run IT; TC-1 contract copy; TC-2 `lint:arch` baseline unchanged; e2e 14.
- doc-writer (after green): `server/specs/project-context.md` (new), `server/README.md` API map, `server/AGENTS.md` read-when line, `server/specs/skills.md` link, `client/specs/pages.md` (`/context`, Context tabs), `reviewer-core/specs/review-contract.md` + `docs/pipeline.md` (specs shape, label escaping, conditional guard), `e2e/specs/flows.md` (flow 14), SPEC-01 status → implemented.
