# Spec: Project Context Folder   |   Spec ID: SPEC-09   |   Status: approved

Feature 1 of the "Project Context" epic (L05 in the roadmap: *Project Context
Folder · Onboarding generator · PR Brief card*). Scoped deliberately small so we
can measure one thing: **does attaching a project document actually change what
the reviewer says?**

**Affected modules:** `server`, `client`, `reviewer-core`, `mcp-server` (the
pre-push CLI, added by decision D5 below). Cross-module, hence a root spec.

## Problem & Motivation

A review agent today sees the diff, the PR description, derived intent, skills,
and repo-derived structure. It does **not** see the project's own written rules —
the PRD that says "no endpoint may expose internal account IDs", the architecture
note that says "`api/` must not import `db/` directly". Those rules live as
markdown in the repository and are invisible to every run. As a result the
reviewer can only flag generic defects, never a violation of *this project's*
stated invariants, and a user who wants project-specific review has no lever
other than rewriting the agent's system prompt by hand.

The prompt already reserves the space for exactly this. Its assembled user
message has a defined section order, and one of those sections is
`## Project context` — untrusted spec content, delimiter-wrapped like the diff —
which has shipped empty since the skills lesson, alongside a run-trace field for
"documents read" that has always been an empty list. This feature fills both: it
lets a user browse the markdown docs that already exist in the repo checkout,
attach the relevant ones to an agent or a skill, see what that costs in tokens
before committing to it, and then see in the run trace exactly which documents
the model was given.

Selection is **manual on purpose**. An auto-selector that picks documents from PR
content is a separate, later feature; shipping manual attachment first gives us a
controlled baseline to evaluate any future automatic selection against.

## Goals / Non-goals

### Goals

- **G1** — Discover the markdown documents that already exist in a repo's synced
  checkout, under configurable search roots, and present them as a browsable,
  **view-only** list with a rendered preview.
- **G2** — Let a user attach a subset of those documents to an agent, in an
  explicit order, and to a skill (where every agent using the skill inherits
  them). The attachment is **pinned to the repo the document was browsed from**.
- **G3** — Show the token cost of each document, of the currently attached set,
  and of the whole discovered set, *before* the user commits to attaching —
  computed with the same counter the run and the skill editor use, so no two
  numbers in the product disagree.
- **G4** — At run time, read the attached documents' current content from the
  repo's **synced default-branch checkout** and inject them into the prompt's
  existing `## Project context` section as delimiter-wrapped **untrusted data**,
  covered by the existing shared injection guard.
- **G5** — Make the injection auditable: the run trace names every document that
  was read, its token size, and whether it came from the agent directly or was
  inherited from a skill; documents omitted or dropped are named with a reason;
  the prompt-assembly view can show the assembled block verbatim.
- **G6** — Add **zero** LLM calls. The whole feature is a filesystem read plus
  deterministic template assembly.
- **G7** — Give the pre-push working-copy review (`devdigest review --mode
  working`, SPEC-08) the same project context as a PR-triggered run, so a
  developer's pre-push pass and the server-side pass judge against the same
  stated project rules.

### Non-goals (explicitly out of scope for this slice)

- **N1 — Automatic / content-based selection.** No ranking, embedding search, or
  "pick the docs relevant to this PR" behavior. Manual selection only.
- **N2 — Editing documents through this UI — decided, not merely recommended.**
  The Project Context page is **view-only**: no Preview/**Edit** toggle at all
  (the page shows Preview only), no inline edit, no file upload, no create-file,
  no create-folder, no delete — despite all of those appearing as affordances in
  the Project Context mockup. Three options were considered and the third was
  chosen deliberately to keep this first slice small: (a) real git write-back
  (commit + PR), (b) a DB overlay storing user edits outside the clone — the
  pattern the existing `conventions` table/module already establishes, (c)
  view-only. Feasibility, for the record: the clone is overwritten only on a
  manual `POST /repos/:id/refresh` / `POST /repos/:id/resync`
  (`server/src/adapters/git/simple-git.ts:77-88`,
  `server/src/modules/repos/routes.ts:39`,
  `server/src/modules/repo-intel/routes.ts:43-65`) and never automatically or by
  webhook — so an in-clone edit would *not* be destroyed immediately, but would be
  silently lost on the next sync, with no warning and without ever reaching the
  real repository. Documents are edited by editing the repo. *(Breadcrumb for
  whoever picks up "editable project context" later: the GitHub adapter already
  defines `commitFiles()` and `openPullRequest()` on the shared `GitHubClient`
  interface, implemented in both the real adapter and the mocks but wired to
  nothing — `server/src/adapters/github/octokit.ts:235-320`. That is existing
  scaffolding to reuse rather than write-back to build from scratch.)*
- **N3 — Chunking, embedding, or vector indexing of documents.** This slice
  injects whole documents, not retrieved chunks. The mockup's footer ("Indexed:
  12 files · 1,240 chunks · last 5m ago") describes retrieval machinery belonging
  to a later feature; it is replaced by a plain discovery summary of document
  count and total tokens (AC-38, AC-39).
- **N4 — The "78% COVERAGE" ring.** Not deferred-but-drawn: the ring is removed
  from the Project Context page for this slice. No coverage metric is defined,
  computed, or displayed. Per-document, the ring's place is taken by a plain
  "used by N agents" count (AC-22).
- **N5 — Non-markdown documents** (PDF, Confluence, Notion, URLs) and documents
  that do not exist inside the repo checkout.
- **N6 — Per-run or per-PR overrides.** Attachment is agent/skill configuration,
  not something chosen at review time.
- **N7 — Portable / cross-repo attachments.** An attachment does not follow an
  agent to another repo, and the same relative path is never re-resolved against
  a different repo's checkout (decision D3).
- **N8 — Reading an attached document at the PR branch head.** A run never reads
  the revision under review, only the synced default-branch checkout (decision
  D4). "Review this PR against the version of the doc this PR itself introduces"
  is out of scope.
- **N9 — Partial-document truncation at the token cap.** Reduction drops whole
  documents only; no document is ever cut mid-content (decision D6).
- **N10 — Versioned attachments.** Attachment lists are current-state only: they
  do not participate in any versioned agent/skill configuration snapshot or
  history, and no run replays an older version's document set. Changing an
  attachment list takes effect on the next run (AC-37).

### Decisions resolved from the design sources

The mockups contain two genuine discrepancies. Both are resolved here rather than
left open:

- **D1 — One block, not two.** The skill editor's "SERIALIZES AS" preview shows
  `## Project specifications`, while the agent editor and the trace both say
  `## Project context`. The trace panel lists exactly **one** prompt-assembly row
  ("Project context — attached specs (untrusted)"), and the prompt has exactly one
  `## Project context` section. Resolution: **skill-inherited documents are merged
  into the single agent-level `## Project context` block**, de-duplicated by
  document, not serialized under a separate heading inside the skill body. The
  skill editor's preview must therefore show the same heading the run actually
  emits. `## Project specifications` is a mockup error. This also follows the
  product's existing rule that a preview and the run must share one renderer —
  a preview that formats differently is lying about what the model receives.
- **D2 — Read-only browser.** See N2 above — now a decision, not a suggestion.

### Decisions resolved by the product owner

- **D3 — Attachment pins to the repo it was attached from.** Agents and skills
  are workspace-level objects; documents are repo-level. An attachment records
  *(repo, repository-relative path)* and resolves only against that repo's
  checkout. If an agent is ever run against a different repo, its attached
  documents simply do not apply — that case is outside this feature's model,
  matching the current single-repo-per-workspace architecture. (AC-8, AC-33.)
- **D4 — Runs read the synced default-branch checkout, not the PR branch head.**
  Deliberate: a PR author must not be able to weaken the very invariant document
  their PR is being judged against, inside the same PR. (AC-14, N8.)
- **D5 — The pre-push CLI is in scope.** `devdigest review --mode working`
  (SPEC-08) already runs the same engine minus the slots that need a persisted
  PR; attached documents need no PR, so the CLI path injects the same project
  context. This puts `mcp-server` in this feature's affected-modules list.
  Because that path persists no run row, the equivalent transparency is rendered
  in the CLI's own report rather than a stored trace. (AC-30, AC-31.)
- **D6 — At the token cap, drop lowest-priority documents whole.** Priority is
  the existing attach order — the reorderable list *is* the priority signal — so
  reduction drops from the bottom of the resolved order until the block fits, and
  names what it dropped. No truncation, no refusal to run. (AC-21, AC-32, AC-34,
  N9.) The numeric budget itself is deliberately left to planning — see open
  question 3.
- **D7 — View-only for this slice.** See N2, including the feasibility findings
  and the write-back breadcrumb. (AC-35.)
- **D8 — "Used by N agents" counts direct attachments only**, not agents that
  inherit the document through a skill — the simplest count, no join through
  agent-skill links. Inheritance remains visible where it matters, on the agent
  and skill editors and in the run trace's origin field. (AC-22.)
- **D9 — No versioning of attachments.** See N10. (AC-37.)
- **D10 — Discovery summary replaces the indexing footer.** The page shows how
  many documents were discovered and their total token cost — a sum of counts
  this feature already computes, so it reopens neither N3 nor N4. (AC-38, AC-39.)

## User stories

- **US-1** — As a reviewer-owner, I open **Project Context** for a repo and see
  every markdown document the project has under the configured roots, with its
  path and doc type, so I know what is available to attach. *(AC-1, AC-3, AC-4,
  AC-5, AC-20, AC-22, AC-35, AC-39)*
- **US-2** — As a reviewer-owner, I attach two documents to an agent and drag one
  above the other, so I control what the model reads first — and so I control
  what survives if the set is too big to fit. *(AC-8, AC-9, AC-10, AC-23, AC-37)*
- **US-3** — As a reviewer-owner, I attach a document to a *skill*, so every agent
  that has that skill enabled inherits it without me repeating the attachment on
  each agent. *(AC-11, AC-12, AC-13)*
- **US-4** — As a reviewer-owner, I see a per-document token count, a running
  total for the attached set, and a total for everything discovered, so I can
  judge the budget cost before I attach anything. *(AC-6, AC-7, AC-38)*
- **US-5** — As a reviewer-owner, I run a review and the attached documents are in
  the prompt as untrusted, delimited data, so the model can apply my project's
  rules but cannot be commanded by them. *(AC-14, AC-15, AC-16, AC-17, AC-24,
  AC-27, AC-28, AC-33)*
- **US-6** — As a reviewer-owner, I open the run trace and see exactly which
  documents were read and how big they were, so I can attribute a finding — or a
  token bill — to a specific document. *(AC-18, AC-19)*
- **US-7** — As a reviewer-owner, I attach a doc stating "module `api/` must not
  import `db/` directly", open a PR that violates it, and the reviewer produces a
  finding that cites that document, so I can confirm attached context actually
  changes reviewer behavior. *(AC-25)*
- **US-8** — As a reviewer-owner, I change the search roots for a repo whose docs
  do not live in `specs/`, and the browser lists that repo's docs instead.
  *(AC-2, AC-29)*
- **US-9** — As a reviewer-owner, when an attached document has been deleted,
  renamed, or moved out of the search roots since I attached it, I see that it is
  missing instead of silently getting a smaller prompt, and my run still
  completes. *(AC-19, AC-26, AC-36)*
- **US-10** — As a developer, I run the pre-push review on my working copy and it
  judges my change against the same attached project documents the server-side
  review would use, so pre-push and post-push verdicts don't diverge for reasons
  I can't see. *(AC-30, AC-31)*
- **US-11** — As a reviewer-owner, when my attached set is too large for the
  budget, the lowest-priority documents are dropped rather than the run failing
  or a document being cut in half, and I can see exactly which ones were dropped.
  *(AC-21, AC-32, AC-34)*
- **US-12** — As a security-conscious reviewer-owner, a PR that edits an attached
  invariant document is still judged against the document as it stands on the
  default branch, so a PR cannot weaken the rule it is violating. *(AC-14)*

## Acceptance criteria (EARS)

*Term used below:* a run's **resolved order** is the merged, de-duplicated
document sequence defined by AC-11. It is both the order documents are rendered
in and, read from the bottom, the drop priority used by AC-21.

### Discovery and browsing

- **AC-1** — WHEN a user opens the Project Context page for a repo, the system
  shall list every `.md` file found under that repo's configured search roots in
  the repo's synced checkout, each shown with its repository-relative path and a
  doc-type label derived deterministically from the root it matched.
  *Verify: the listed paths equal the set of `.md` files under the configured
  roots in a fixture checkout.*
- **AC-2** — The system shall obtain the set of search roots from configuration
  with a documented default, and shall not depend on any single fixed root.
- **AC-29** — WHEN a repo's configured search roots change, the next scan shall
  list documents from the new roots only.
  *Verify: change the roots on a fixture repo, refresh, compare the listing.*
- **AC-3** — WHEN a user triggers refresh on the Project Context page, the system
  shall re-scan the checkout and reflect files added, removed, or renamed since
  the previous scan, including in the discovery summary of AC-38.
- **AC-4** — WHEN a user selects a document in the browser, the system shall
  render that document's current content as read-only markdown.
- **AC-35** — The Project Context page shall present document content in preview
  only, exposing no edit toggle, inline editor, upload, create-file,
  create-folder, rename, or delete affordance.
  *Verify: the page offers no control whose action would modify a document.*
- **AC-5** — The system shall never write to, create, rename, upload into, or
  delete anything in the repo checkout as a result of any Project Context action.
  *Verify: no write path exists from this feature's surface to the checkout.*
- **AC-6** — WHERE a document is listed in the Project Context page or in an
  agent's or skill's Context tab, the system shall display that document's token
  count computed with the same token counter used for skill bodies and for
  per-run skill token attribution, never a separate estimate.
  *Verify: a document and a skill body of identical text report identical counts.*
- **AC-7** — WHILE at least one document is attached in an editor, the system
  shall display the summed token count of the attached set, updating as documents
  are attached and detached.
- **AC-38** — WHEN the Project Context page lists a repo's documents, the system
  shall display a discovery summary stating how many documents were discovered
  and their summed token count across **all** discovered documents — not only the
  attached ones — counted with the same counter as AC-6.
  *Verify: the summary's total equals the sum of the per-document counts shown in
  the listing.*
- **AC-39** — The Project Context page shall present no chunk count, no index
  count, and no coverage percentage.
  *Verify: the word "chunks" and any coverage ring or percentage are absent from
  the page.*
- **AC-20** — WHEN the repo has no checkout yet, or the scan finds no matching
  files, the system shall render an explanatory empty state naming the roots it
  searched, rather than an error.
- **AC-22** — WHEN a document is listed, the system shall show how many agents
  have that document attached **directly**, excluding agents that would inherit it
  through a skill, including an explicit zero state.
  *Verify: an agent that only inherits a document via a skill does not increment
  that document's count.*
- **AC-23** — WHEN a user types in a Context tab's filter box, the system shall
  narrow the visible document list by path match without changing any attachment
  or ordering state.

### Attachment

- **AC-8** — WHEN a user attaches or detaches a document on an agent or a skill,
  the system shall persist a **reference to the document as (repository,
  repository-relative path) only**, pinned to the repository the document was
  browsed from, and never a copy of the document's text.
  *Verify: the stored agent/skill configuration names a repository and a path and
  contains no document body text.*
- **AC-9** — WHEN a user reorders an agent's or a skill's attached documents, the
  system shall persist the new order and later runs shall render those documents
  in that order.
- **AC-10** — WHEN a user detaches a document and re-attaches it without
  reordering, the system shall restore its previous position rather than
  appending it to the end (matching how an agent's skill links keep their order
  while switched off).
- **AC-37** — WHEN an agent's or skill's attachment list changes, the next run
  shall use the current list, and no run shall reconstruct an earlier version's
  attachment list.
  *Verify: detach a document, re-run, and the assembled block reflects the change
  with no version-replay path available.*
- **AC-11** — WHEN a run's agent has documents attached directly AND has an
  enabled skill with its own attached documents, the system shall render one
  merged `## Project context` block containing the agent's own documents first in
  their configured order, then the skill-inherited documents in enabled-skill
  order and each skill's own document order, with any document appearing more than
  once emitted exactly once at its earliest position.
  *Verify: an agent and its skill both attaching the same path yields one
  occurrence in the assembled block.*
- **AC-12** — WHERE a skill's documents are inherited by an agent, they shall be
  gated exactly like the skill's body: a document reaches the prompt only when the
  skill is enabled at the workspace level AND enabled on that agent.
- **AC-13** — The skill editor's "serializes as" preview shall display the same
  heading text and the same rendering the run actually produces for that skill's
  documents.
  *Verify: preview output for a skill's document set matches the assembled block
  for an agent whose only source is that skill.*
- **AC-26** — WHEN an attached document no longer exists at its recorded path in
  its pinned repository, the agent's and skill's Context tab shall show that
  attachment in a distinct "missing" state, retaining the attachment rather than
  silently discarding it.

### Run-time injection

- **AC-14** — WHEN a review run starts for an agent with at least one attached or
  inherited document, the system shall read each document's current content from
  the pinned repository's **synced default-branch checkout** as of run start, and
  shall not read the revision on the pull request's branch under review.
  *Verify: a PR whose diff edits an attached document yields the default-branch
  text of that document in the assembled prompt, not the PR's edited text.*
- **AC-33** — IF a review run executes against a repository other than the one an
  attached document is pinned to, THEN the system shall not inject that document
  and shall record the skip and its reason in the run's trace.
  *Verify: an agent whose attachment is pinned to repo A, run on repo B, produces
  an assembled block without that document and a recorded skip.*
- **AC-15** — The system shall render every attached document inside the prompt's
  untrusted delimiter wrapper, labelled with the document's repository-relative
  path, under the `## Project context` heading — never as a bare string
  concatenation into the prompt.
  *Verify: the assembled user message contains an untrusted-source wrapper around
  each document's body.*
- **AC-16** — WHERE an agent has zero attached and zero inherited documents, the
  assembled prompt shall be byte-identical to the prompt produced before this
  feature, with the project-context section absent from the trace — the existing
  omit-when-empty contract every optional prompt section already follows.
- **AC-17** — The system shall complete the whole attach-and-inject path without
  any additional LLM call: document discovery, token counting, content reading,
  and block assembly shall all be deterministic.
  *Verify: run a review with documents attached against a stubbed provider and
  assert the same number of provider calls as with none attached.*
- **AC-24** — IF an attached document contains text that instructs the model to
  change role, ignore findings, or descope the review, THEN the system shall still
  treat that document strictly as data, under the existing shared injection guard.
  *Verify: a fixture document containing "ignore all security findings" does not
  suppress a real finding.*
- **AC-25** — WHEN an agent has a document attached that states a project
  invariant, and it reviews a diff that violates that invariant, the document's
  path shall be present in the prompt alongside its content so the resulting
  finding can name the document that stated the rule.
  *Verify: the `api/` must-not-import-`db/` scenario produces a finding whose text
  names the attached document.*
- **AC-30** — WHERE a review is initiated through the pre-push working-copy CLI
  mode (SPEC-08), the system shall resolve and inject the project-context block
  from the same agent-direct and skill-inherited attachments, in the same resolved
  order, read from the same synced default-branch checkout, as a PR-triggered run
  for that agent would produce — independently of the state of the developer's
  local working copy.
  *Verify: for one agent and one diff, the assembled project-context block from
  the CLI path equals the block from the PR path.*

### Transparency and failure handling

- **AC-18** — WHEN a run completes, the run trace shall record, for every
  document actually injected, its repository-relative path, its token size, and
  whether it was attached directly to the agent or inherited from a skill, and the
  trace UI shall render that list in the run's Configuration section and the
  assembled block as an expandable prompt-assembly row.
- **AC-36** — WHEN a run resolves an attached document whose file has been
  deleted, renamed, or moved outside the configured search roots since it was
  attached, the system shall omit that document from the assembled block, record
  the omission with its path and a reason distinguishing it from a containment
  refusal or an unsynced repository, and complete the run — in the run trace for a
  PR-triggered run, and in the CLI report for a CLI run.
  *Verify: delete an attached document from a fixture checkout, re-run, and the
  run completes with the document absent from the block and named as omitted.*
- **AC-19** — IF an attached document cannot be read at run start for any other
  reason (unreadable, not a regular file, or its pinned repository has no synced
  checkout), THEN the system shall omit that document, continue the run with the
  remaining documents, and record the omission and its reason in the run's log and
  trace — never failing the run.
- **AC-21** — IF the assembled project-context block would exceed the configured
  token budget, THEN the system shall drop whole documents from the end of the
  resolved order — lowest priority first — until the remaining set fits within the
  budget, never truncating a document's content mid-document.
  *Verify: with a budget that fits only the first of three attached documents, the
  assembled block contains document 1 only, whole.*
- **AC-34** — WHERE budget reduction drops every document, the system shall omit
  the project-context section entirely, exactly as in AC-16, rather than emitting
  an empty section or failing the run.
  *Verify: a single attached document larger than the whole budget yields a run
  whose assembled prompt has no project-context section, and which still
  completes.*
- **AC-32** — WHEN one or more documents are dropped to fit the token budget, the
  system shall record each dropped document's repository-relative path, token
  size, and a budget-drop reason alongside the documents that were included — in
  the run trace for a PR-triggered run, and in the CLI report for a CLI run.
  *Verify: the trace for an over-budget attached set names every dropped document,
  not just the included ones.*
- **AC-31** — WHEN a pre-push CLI review completes, the CLI's report shall list
  the documents that were injected (path, token size, and whether direct or
  skill-inherited) and any that were omitted or dropped with the reason, because
  that path persists no run trace.
  *Verify: the CLI output for a run with one attached and one missing document
  names both, with the missing one marked.*
- **AC-27** — IF an attached path resolves outside the pinned repository's
  checkout directory (via `..` segments, an absolute path, or a symbolic link
  pointing out of the checkout), THEN the system shall refuse to read it, record
  the refusal, and never include its content in a prompt.
  *Verify: an attachment recorded as a path escaping the checkout yields no
  content in the assembled prompt.*
- **AC-28** — The system shall exclude from discovery any path that is not a
  regular readable `.md` file inside the checkout, including symlinks that escape
  the checkout and files exceeding the per-document size limit.

## Edge cases

- **Attached document deleted, renamed, or moved out of the search roots between
  attachment and run** — run proceeds without it, omission recorded with a reason
  (AC-36), editor shows it as missing (AC-26). Renames are not auto-followed in
  this slice.
- **Same document attached both directly and via a skill** — emitted once, at its
  earliest position (AC-11); it counts once, and only for the direct attachment,
  in the "used by N agents" badge (AC-22).
- **Skill disabled at workspace level, or toggled off on the agent** — its
  documents do not reach the prompt (AC-12), matching the skill body's own gating.
- **Zero documents attached** — prompt and trace are indistinguishable from
  today's (AC-16); this is the regression guard for every existing prompt test.
- **Very large document** — bounded per document and in aggregate (AC-21, AC-28);
  a single huge doc must not be able to crowd out the diff. A document larger than
  the whole budget is dropped like any other lowest-priority document rather than
  truncated (AC-21); if it was the only one attached, the section is omitted and
  the drop recorded (AC-34, AC-32).
- **Document containing prompt-injection text** — handled by the existing shared
  guard, not by scanning (AC-24).
- **Repo not yet cloned / clone in progress** — empty state in the browser, with a
  zero-document, zero-token discovery summary rather than an error (AC-20, AC-38);
  at run time the documents are omitted with a reason (AC-19).
- **Checkout advanced by a sync between page load and run** — the run always reads
  content at run start, so a stale browser listing never affects what the model
  receives (AC-14). The clone only moves on a manual refresh/resync (see N2), so
  the listing is stale only after an explicit user action.
- **The PR under review edits an attached document** — the run still reads the
  synced default-branch text (AC-14). This is the deliberate anti-self-weakening
  case: a PR cannot relax the invariant it is being judged against.
- **Pre-push CLI run whose local working copy edits an attached document** — the
  injected content is the synced default-branch text, not the local edit (AC-30);
  the CLI report names what was injected so the difference is visible (AC-31).
- **Traces persisted before this feature** — they carry an empty documents-read
  list, so the trace view must render an empty list without error after the
  contract widens from bare paths to path + size + origin + status.
- **Path with unusual characters** (spaces, non-ASCII, `#`) — must round-trip
  through attachment, listing, and reading unchanged.
- **Two repos in one workspace with same-named docs** — unambiguous by
  construction: an attachment records the repository as well as the path (AC-8),
  and never resolves against a different repo (AC-33).

## Non-functional

- **Security — path containment.** Every read of an attached document must be
  proven to resolve inside that repo's checkout directory before the read happens
  (AC-27). An attachment record is user-supplied data that reaches a filesystem
  read, and today's checkout-read behavior joins a caller-supplied relative path
  onto the clone directory without a containment check — so this feature must
  establish containment itself rather than assume it.
- **Security — untrusted by construction.** Document content is repository
  content, therefore attacker-influenceable on any repo that accepts external
  contributions. It is delimiter-wrapped and covered by the shared injection guard
  (AC-15, AC-24). No new per-document sanitization or denylist is introduced —
  that would contradict the product's standing rule that the single shared guard,
  not keyword scanning, is the defense.
- **Security — a PR cannot weaken the rule it is judged against.** The revision
  read is always the synced default-branch checkout, never the PR branch head
  (AC-14), so editing an invariant document inside a PR does not change how that
  same PR is reviewed.
- **Security — no new write surface.** This feature adds no path that mutates a
  repository, locally or on GitHub (N2, AC-5, AC-35); the existing unwired
  write-back capability stays unwired.
- **Cost / token budget.** Attaching documents must never increase the number of
  LLM calls (AC-17); the token cost must be visible before the user commits
  (AC-6, AC-7, AC-38), bounded at run time by a deterministic whole-document drop
  rule (AC-21, AC-34), and attributable afterwards (AC-18, AC-32).
- **Performance.** Discovery of a repo's documents, per-document token counting,
  and the summed discovery total must be fast enough to drive an interactive
  listing; run-time document reading adds only filesystem reads to a run already
  dominated by an LLM call. This holds for the pre-push CLI path too, where the
  added reads must not make the pre-push pass perceptibly slower than the LLM call
  it already waits on.
- **Backwards compatibility.** An agent with nothing attached must behave exactly
  as before, byte-for-byte in the prompt (AC-16), on both the PR-triggered and the
  CLI path.
- **Accessibility.** The attach checklist is a keyboard-operable list: toggling
  attachment and reordering must both be reachable without a pointer, and the
  attached-count and token-total must be announced when they change. Because order
  is also the drop priority (AC-21), the reordering control must convey each
  document's position, not only that it moved.

## Inputs (provenance)

| Input | Provenance |
|---|---|
| Discovered document list (paths, doc type) | `[deterministic: filesystem scan of the repo's synced checkout under the configured roots]` |
| Document content injected at run time | `[deterministic: file read from the pinned repo's synced default-branch checkout at run start — never the PR branch head]` |
| Per-document and attached-set token counts | `[deterministic: the same token counter already used for skill bodies and per-run skill token attribution]` |
| Discovery summary (document count + total tokens) | `[deterministic: sum of the per-document token counts already computed for the listing — no chunking or indexing]` |
| Attachment records + order (agent, skill) | `[deterministic: user selection, persisted as (repository, path) references only, current-state with no version history]` |
| Skill-inherited document set | `[reused: the existing enabled-skills resolution that already builds the skill prompt section]` |
| Assembled `## Project context` block | `[reused: the existing project-context prompt section and its untrusted-delimiter wrapper]` |
| Project-context block on the pre-push CLI path | `[reused: the same resolution, ordering, budget and assembly path as a PR-triggered run]` |
| Injection guard covering the block | `[reused: the single shared injection guard appended to every agent's system prompt]` |
| Run-trace documents list (included, omitted, dropped) | `[deterministic: the resolved attachment list + token counts of what was actually read]` |
| "Used by N agents" count (direct attachments only) | `[deterministic: aggregation over this feature's own attachment records]` |
| LLM usage added by this feature | `[new: 0 LLM calls]` |

## Untrusted inputs

- **Attached document content** — arbitrary markdown from the repository, written
  by anyone who can land a commit (including an outside contributor on a public
  repo). It is **data, never instructions**: rendered inside the untrusted
  delimiter wrapper under `## Project context`, covered by the shared injection
  guard, and never allowed to reduce, waive, or descope a review (AC-15, AC-24).
- **Attached document path** — user-supplied text that reaches a filesystem read.
  Treated as untrusted input to the filesystem, not as a trusted path: it must be
  validated to resolve inside the pinned repo's checkout before any read (AC-27).
- **Document filenames and paths shown in the UI and echoed into the prompt's
  source label** — repository-controlled strings. They are display/label data,
  must not be interpreted as markup or as an instruction, and must not be able to
  break out of the untrusted wrapper.
- **Search-root configuration** — user-supplied patterns that select filesystem
  paths; they must not be able to select paths outside the repo checkout (AC-27,
  AC-28).

## Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Project Context / Agent · Skill editors
    participant API as Server
    participant FS as Repo checkout (read-only default-branch mirror)
    participant ENG as Prompt assembly

    U->>UI: open Project Context (repo)
    UI->>API: list documents
    API->>FS: scan configured roots for *.md
    FS-->>API: paths
    API-->>UI: paths + doc type + per-doc tokens + summary (N files · ~X tokens)
    U->>UI: attach + reorder on agent / skill
    UI->>API: persist document references + order (repo + path only)

    Note over U,ENG: later — a review run (PR-triggered or pre-push CLI)
    API->>API: resolve agent-direct + enabled-skill documents, dedupe, order
    API->>API: apply token budget — drop from bottom of order, record drops
    API->>FS: read each attached document (path containment checked)
    FS-->>API: default-branch content (deleted/renamed → omit + record)
    API->>ENG: project-context section
    ENG-->>API: "## Project context", each doc untrusted-wrapped
    API-->>UI: trace — documents read / omitted / dropped + assembled block
    Note over API,UI: on the CLI path the same list is printed in the CLI report,<br/>because that run persists no trace (AC-31)
```

## [NEEDS CLARIFICATION: …]

1. **[NEEDS CLARIFICATION: what is the shipped default set of search roots?** The
   written requirement says the default glob is `**/{specs,docs,insights}/**/*.md`;
   the Project Context mockup shows a single root `.devdigest/specs/` with the
   docs listed directly under it. These disagree. Which is the default a freshly
   imported repo gets?]
2. **[NEEDS CLARIFICATION: at what scope are search roots configured — per repo,
   or per workspace applying to all repos? And is there any restriction on who
   may change them?]**
3. **[NEEDS CLARIFICATION — deliberately deferred to planning, not an oversight:
   the numeric limits behind AC-21 and AC-28** — the token budget for the
   assembled `## Project context` block, and the per-document size ceiling. The
   *rule* at the cap is decided and fixed (D6: drop whole lowest-priority
   documents from the bottom of the resolved order); the product owner has
   explicitly delegated the numbers, and whether the budget is absolute or a share
   of the model's context window, to `implementation-planner`. Pick them in the
   plan and document the choice there — do not escalate this back.]
4. **[NEEDS CLARIFICATION: is the doc-type label anything other than a rendering
   of the matched root** (`specs`/`docs`/`insights`)? The mockup color-codes three
   fixed types; if search roots are freely configurable (AC-2), a repo with a
   fourth root needs a defined label and color behavior.]
5. **[NEEDS CLARIFICATION: does the reviewer need to be *instructed* to cite the
   attached document, or is presence in the prompt enough?** AC-25 requires only
   that the document's path travels with its content so the model *can* name it.
   If the product expects a guaranteed citation (analogous to the existing
   diff-line citation gate that drops ungrounded findings), that is a stronger
   requirement and needs its own criterion.]
6. **[NEEDS CLARIFICATION: is an e2e browser flow expected as part of this
   slice**, given the existing flows assume a DB seeded with only the one demo
   repo?]
7. **[NEEDS CLARIFICATION: is a concrete latency target wanted for the document
   listing and token counting, or is "no perceptible delay on a typical repo"
   sufficient?]**
