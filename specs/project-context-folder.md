# Spec: Project Context Folder   |   Spec ID: SPEC-01   |   Status: implemented
Modules: server · client

## Problem and why

Review agents see the diff and the repo map, but not the team's written intent: PRDs, specs, architecture
notes, lessons from incidents. So they flag things the specs allow and miss things the specs forbid. These
documents already sit in the repository as markdown. DevDigest should show them per repo, let the user
choose which ones each agent reads for that repo, and pass those docs to the agent's review as grounding
context, with a predictable token cost.

## Goals / Non-goals

Goals
- A per-repo **Project Context** page: the markdown docs found in the repo, with a read-only preview.
- In the agent editor, a **Context** tab: attach or detach docs of the active repo for that agent, and set their order.
- Review runs include the attached docs as an untrusted project-context section, capped at 4,000 estimated
  tokens, and the run trace shows what was included and what was left out.

Non-goals
- Creating, editing, uploading or deleting docs in the app. The design's editable `.devdigest/specs/`
  folder (N6 New file / Upload / Edit) is out: docs are edited in the repo and arrive with a Resync.
- Attaching docs to **skills**, and skills passing them on to agents (design N2c). This is a follow-up spec.
- Chunking, embeddings or retrieval of doc fragments ("1,240 chunks" in N6). Docs are sent whole, never cut.
- The design's "COVERAGE" score (N6). It is undefined.
- Reading a doc as changed by the PR under review. The run trace only notes it (AC-9).
- Concurrent-edit warnings for attachments: DevDigest is local-first and single-user, so the last write wins.
- Project context in CI-runner reviews (L06 Export to CI).
- Agent versions for attachment changes. Skill-link changes don't create versions today either; what an
  agent actually read is recorded per run in the trace (AC-9). Versioning both is a follow-up spec.
- Tracking sync progress or storing the reason a resync failed. Only the states DevDigest already knows are
  shown (AC-5); a "syncing / sync failed" state belongs to repo sync, not to this feature.

## User stories

- As a reviewer-agent owner, I attach `specs/security-baseline.md` to the Security agent for repo X, so its
  reviews of PRs in X follow our baseline.
- As a team member, I browse a repo's specs and docs in one place without cloning it.
- As a cost-conscious user, I see how many tokens the attached docs add to each run before I run a review.

## Acceptance criteria (EARS)

- **AC-1** WHEN the user opens the Project Context page of a repo, the system SHALL list, at the repo's last
  synced commit, these markdown docs:
  - the root `README.md`;
  - the `README.md` of each top-level package;
  - every `INSIGHTS.md`;
  - every `*.md` under any `specs/` or `docs/` folder, at any depth.

  Anything under `node_modules/`, `vendor/`, `.git/` or `clones/` is excluded. Each entry shows its path, a
  source label (`readme` / `insights` / `specs` / `docs`), an estimated token count (characters ÷ 4) and how
  many agents have it attached for this repo.
- **AC-2** WHEN the user selects a doc on the Project Context page or clicks Preview in the agent Context tab,
  the system SHALL show it rendered as read-only markdown, with its path, source label, token estimate and
  attached-agents count. In the agent tab the preview also has an Attach/Attached toggle.
- **AC-3** WHEN the user types in the document filter, the system SHALL show only docs whose name or
  folder contains the text (case-insensitive). IF nothing matches, THEN it SHALL show "No documents found".
- **AC-4** IF the repo has no docs matching AC-1, THEN the system SHALL show an empty state that names the
  locations it searched and offers the repo's Resync action.
- **AC-5** WHILE the repo is not cloned, the system SHALL show a "not cloned" state and the repo's Resync
  action instead of the doc list. WHILE the repo is cloned but its code index is failed or degraded, the
  system SHALL still show the doc list (docs need only the clone), with a notice above it giving the index
  state, its reason (if any) and the Resync action.
- **AC-6** WHEN the user toggles a doc in the agent editor's Context tab, the system SHALL save the attachment
  for that (agent, active repo) pair. Attached docs are listed first, in attach order, and the order can be
  changed with the mouse (drag) and with the keyboard. Each change is saved and survives a page reload.
- **AC-7** The Context tab SHALL show the sum of the estimated tokens of the attached docs, "N of M attached",
  and a warning badge when the sum exceeds 4,000 tokens. WHEN the user attaches a doc whose own estimate
  exceeds 4,000 tokens, the tab SHALL warn that it will be left out of every run as too large. Saving is
  allowed in both cases.
- **AC-8** WHEN an agent reviews a PR of repo R and has docs attached for R, the system SHALL add those docs'
  full content, in attach order, to every model call of that run as an untrusted project-context section.
  The content is read from R's last synced commit.
- **AC-9** The run trace drawer SHALL show a "Project context" block for each run of an agent with
  attachments for R. It lists:
  - each included doc;
  - each left-out doc with its reason: "too large" (alone over 4,000 tokens; skipped, the next docs are
    still considered), "over cap" (would push the total over 4,000; it and every later doc are left out),
    or "missing" (AC-10);
  - for each attached doc the PR itself changes: "this PR changes <doc>; the agent saw the synced version".
- **AC-10** IF an attached doc no longer exists or can't be read at R's last synced commit (for example it was
  deleted or renamed before a resync), THEN the system SHALL mark it "missing" in the Context tab with a
  Detach action, skip it in runs, and show it as "missing" in the run trace. The run SHALL NOT fail because of it.
- **AC-11** WHERE an agent has no docs attached for the PR's repo, the system SHALL build the review prompt
  exactly as it would without this feature, and the run trace SHALL show no Project context block.
- **AC-12** WHEN the user changes an agent's attachments (attach, detach, reorder), the system SHALL apply the
  change from the agent's next run on, without creating a new agent version (as with skill links today).
  Runs that already started keep the attachments they started with.
- **AC-13** The system SHALL only list, attach and inject docs for agents and repos in the requesting user's
  workspace. A request that names another workspace's agent or repo SHALL be answered as not found.

## Edge cases

- **The PR edits an attached doc:** the agent sees the synced version. The trace notes it (AC-9). Nothing is blocked.
- **A single doc is bigger than the cap:** it is never cut. It is skipped whole, with a warning at attach
  time (AC-7) and "too large" in the trace (AC-9).
- **An attached doc is deleted or renamed in the repo, then a resync runs:** the review doesn't fail. The doc
  is skipped and shown as "missing" in the run trace and the Context tab (AC-10). A renamed doc is not
  re-matched to its new path.
- **Agent or repo deleted:** its attachments go with it. A repo re-added later starts with no attachments.
- **Many docs (hundreds, e.g. a monorepo with nested `specs/`):** the list scrolls and the filter (AC-3)
  narrows it. Long paths are shortened, with the full path on hover and in the accessible name.
- **Two tabs edit the same agent's attachments:** the last write wins (Non-goal: conflict warnings).
- **Multi-call (map-reduce) review:** the section goes into every per-file call (AC-8), so its cost repeats
  per call (see Inputs).
- **Non-markdown or binary file in a discovery location:** it is not listed.

## Non-functional

- **Security:** docs are read only from inside the repo clone. Nothing is read from VCS metadata, secret
  files (`.env*`) or the excluded folders (AC-1). Doc content is untrusted text (see below).
- **Cost:** no new LLM call. Attached docs add up to ~4,000 input tokens to every model call of a run (see Inputs).
- **a11y:** the attach toggles and the reorder control are keyboard-operable and have accessible names that include the doc path.
- **i18n:** all UI text comes from message catalogs.

## Inputs (provenance)

- Doc list, previews, token estimates: `[deterministic: files in the repo clone at the last synced commit]`.
- Attached-agent counts, attachments: `[deterministic: DevDigest's stored attachments]`.
- "PR changes <doc>" note: `[deterministic: the PR's changed-file list]`.
- Project-context section in reviews: `[reused: existing review run]` → `[new: 0 LLM calls]`, but more input
  tokens. **Cost: up to 4,000 tokens × the number of model calls in the run.**
  - Single-pass: +≤4,000 tokens per run.
  - Map-reduce over N files: +≤4,000 × N tokens per run.

  The per-agent run estimate and the recorded run cost SHALL include this extra input. They are not
  computed without it.

## Untrusted inputs

Doc bodies are repository content written by anyone who can push to the repo, and they go straight into
LLM prompts. They are always data, never instructions:
- In the review prompt they go inside the engine's existing untrusted-block wrapping, under its injection
  guard. Instructions, role changes or "ignore previous" text inside a doc don't change the agent's
  behaviour, and no keyword filtering is used in place of the wrapping.
- In the UI they are shown as rendered markdown without executing HTML or scripts.
- Doc paths are shown as plain text.

## Module interactions

- **Repo sync / repo-intel:** provides the clone at the last synced commit and the code-index state. If the
  clone is missing, the page shows the AC-5 "not cloned" state; a failed or degraded index only adds a notice
  above the doc list (AC-5), and doesn't affect runs. If the clone is missing, runs go
  ahead without the section; the trace says "project context unavailable: repo not synced".
- **Agents (agent editor):** gains the Context tab next to Skills. Attachments are per (agent, repo) and
  apply from the next run; they don't create agent versions (AC-12).
- **Reviews (server run, run trace drawer, run estimates):** reads the attachments for the PR's repo, puts the
  section into every model call, records the Project context block (AC-9), and counts the extra tokens in
  cost and estimates.
- **Review engine (reviewer-core):** already has an optional untrusted project-context prompt section. No
  change is expected. Not providing it leaves the prompt byte-identical (AC-11).
- **Onboarding Tour (SPEC-02):** reuses this doc discovery (AC-1) as one of its inputs.
- **MCP server:** not involved.

## Design review

Sources: `docs/design/devdigest-2/context_docs.jsx` (N2b agent Context tab, N2c skill section, preview
drawer, 4K soft cap), `data_context.jsx` (doc sources, path-only attachments, len/4 estimate),
`screen_tour_context.jsx` (N6 Project Context page + empty state), and the existing UI copy and
"Project Context" sidebar entry in the repo.

User decisions:
- **Conflict:** N6 (an editable `.devdigest/specs/` folder) vs N2b/N2c (read-only repo docs). → Read-only
  from the repo; in-app edits would be lost on Resync.
- **Gap:** design attachments are path-only per agent, but agents span repos. → Per (agent, repo).
- **Gap:** soft cap with no run-time rule. → Warn in the editor; at run time whole docs are included, and a
  too-large doc is skipped, never cut (AC-7, AC-9).
- **Gap:** design sources were `specs/` · `docs/` · `insights/`. → Discovery per AC-1: READMEs,
  `INSIGHTS.md`, nested `specs/` and `docs/`.
- **Accepted proposal:** a Project context block in the run trace drawer (AC-9).
- **Accepted proposal:** the N6 "Re-index" button is the repo's existing Resync action. There is no separate
  doc index (AC-4, AC-5).

Other notes:
- **Missing states added:** not cloned / index failed or degraded (AC-5), attached doc missing (AC-10), filter with no
  results (AC-3), over cap and too large (AC-7, AC-9), PR changes a doc (AC-9).
- **Dropped from the design:** N6 Upload/New file/New folder/Edit, "COVERAGE" score, chunk counts, the N2c
  skill section (Non-goals).

## [NEEDS CLARIFICATION]

none
