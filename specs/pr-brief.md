# Spec: PR Why + Risk Brief   |   Spec ID: SPEC-06   |   Status: approved
Modules: server · client
Related: [project-context-folder.md](project-context-folder.md) (SPEC-01, doc selection + 4K cap),
[project-context-for-skills.md](project-context-for-skills.md) (SPEC-05, inherited docs),
[../client/specs/pr-brief-extras.md](../client/specs/pr-brief-extras.md) (SPEC-07, P3 follow-up: verdict banner, risk expand, scroll to line),
[../server/specs/intent-layer.md](../server/specs/intent-layer.md) (L03 Intent), [../plans/blast-radius.md](../plans/blast-radius.md) (L04).

## Problem and why

A reviewer opens someone else's PR cold. They don't know why it exists, what is risky in it, or where to start
reading. The answers are scattered across the Intent block (L03) and Blast radius (L04).
The **PR Brief** on the Overview tab brings these facts together. It adds two parts written by a model:
**Risk areas** and **Review focus — read these first**. Each brief costs exactly one model call, made only when
the user asks. The model gets precomputed facts only, never diff code.

## Goals / Non-goals

Goals (P1 = definition of done; P2 marked in the ACs)
1. The Overview tab has a PR Brief block. While no brief exists, the block shows **Generate brief**.
2. A generated brief has five parts: Summary (2–4 sentences: what and why), the existing Intent and Blast
   radius blocks side by side, Risk areas, and Review focus.
3. Clicking a Review focus item opens Files changed (`?tab=diff`) with that file expanded in the flat file list
   and scrolled into view.
4. After a reload the stored brief shows at once, with no model call.
5. Regenerate replaces the stored brief.

Non-goals
- The model never reads diff code (hunk bodies). It gets hunk line ranges only.
- No code-level findings (secrets, N+1, etc.) — that is the review's job. Risks and focus items come only from
  metadata: paths, roles, stats, intent, blast, docs and the PR description.
- No change to Intent, Blast radius or Smart Diff, or to how they are generated. The brief only reads their
  stored or computed results. Generating a brief never starts an Intent derivation.
- No dependency on Smart Diff (not on the base branch, see Module interactions); expanding a file inside a
  Smart Diff group is out of scope.
- No automatic generation when a PR is opened, synced or gets a new commit. Generation is click-only, because
  each one costs money.
- No prior-PR history (L04 P3) in the brief. The Blast block keeps its own "Prior PRs" section.
- The brief is not a re-review: it produces no findings and no verdict of its own.
- No brief history or versions. Only the latest brief per PR is stored.
- No MCP tool for the brief.
- Out of this spec (follow-up SPEC-07): latest-review verdict + score in the banner, expandable risk
  explanation, scroll to the exact line.

## User stories

- As a reviewer, I open PR #482, click Generate brief, and in under a minute I know why the PR exists, which
  areas are risky, and which places to read first.
- As a reviewer, I click `src/config.ts:12 — …` and land on that file, expanded, in Files changed.
- As a cost-conscious user, I reopen the PR tomorrow and see the same brief with no new model call. I also see
  what it cost and which inputs were missing or cut.

## Acceptance criteria (EARS)

P1
- **AC-1** [P1] WHEN the user opens the Overview tab of a PR that has no stored brief, the system SHALL show a
  "PR Brief" block with "No brief yet", a **Generate brief** action and the name of the Risk Brief model. The
  Intent and Blast radius blocks SHALL be shown as they are today. Opening the tab SHALL make no model call.
- **AC-2** [P1] WHEN the user clicks Generate brief, the system SHALL disable the action, show a generating
  indicator, and then show the brief:
  - Summary as plain text;
  - Intent (left) and Blast radius (right), side by side;
  - "Risk areas" under Intent: each item shows a title, its severity (high / medium / low) as a coloured icon
    plus a text label, and its file refs;
  - a full-width "Review focus — read these first (N)" list of `file:line — reason` items, in the order the
    model gave (= read first).
- **AC-3** [P1] For each generation the system SHALL make exactly one model call to the Risk Brief feature
  model (Settings → Risk Brief), plus at most 1 retry when the reply fails validation. The call's input SHALL
  be built only from the inputs listed in Inputs (provenance). For each changed file it gets the path,
  additions, deletions, the Smart Diff role when available (never on this branch, see Module interactions) and
  the hunk line ranges (e.g. `@@ -38,9 +40,13 @@`). It SHALL contain no line of diff content.
- **AC-4** [P1] The spec-docs input SHALL be the docs attached for this repo to every enabled agent of the
  workspace (each agent's own attachments, SPEC-01, in its attach order). Docs inherited from skills (SPEC-05)
  are not included — SPEC-05 is not implemented; see SPEC-07. Agents are taken in name order; docs are
  de-duplicated by path, so each doc goes in once (at its first position). The SPEC-01 selection rules apply (whole docs, "too large", "over cap", "missing") with
  one 4,000-token cap. No attached docs → generation goes ahead without them.
- **AC-5** [P1] IF the Intent, the Blast radius or the Smart Diff roles are unavailable for the PR, THEN the
  system SHALL still generate the brief. The brief SHALL show a "Missing inputs" note naming each one with its
  reason, e.g. "Intent unavailable — not derived yet", "Blast radius unavailable — <reason>". The blast reason
  SHALL be the same one the Blast radius block shows for that PR (index missing, failed or partial, or repo
  intelligence off). Smart Diff roles are always missing on this branch: the note SHALL say "Smart Diff roles
  unavailable — not in this build". A PR without a linked issue or without attached docs is not "missing".
- **AC-6** [P1] Before saving, the system SHALL drop every risk file ref and every Review focus item whose file
  is neither a changed file of the PR nor (when the blast radius is available) a file in its blast map. A risk
  file ref is `path` or `path:start-end`; grounding matches on the path part. A risk left with no file ref SHALL
  be dropped. Model-supplied paths never become links unless they pass this check.
- **AC-7** [P1] Each kept Review focus item SHALL have a positive whole-number line. For a file that is only
  in the blast map (not changed in the PR), the model's line SHALL be kept as is (no snapping). For a changed
  file: IF the line is outside every changed hunk (new side) of that file, THEN the system SHALL move it to the first line of the nearest
  changed hunk (on a tie, the earlier hunk). IF the file has no new-side hunk lines (binary, pure rename,
  deleted, or patch not provided by GitHub), THEN the item SHALL be file-level: stored as line 1 and shown as
  `file — reason`, with no line. Items that become duplicates (same file and line) keep the first.
- **AC-8** [P1] IF no risks remain after AC-6, THEN Risk areas SHALL show "No notable risks flagged." IF no
  Review focus items remain, THEN the list SHALL show "No review focus items." Neither case is an error.
- **AC-9** [P1] WHEN the user clicks a Review focus item or a risk file ref for a changed file, the system SHALL
  switch to `?tab=diff`, expand that file in the flat Files changed list and scroll so the file's header is
  visible. WHEN the item's file is only in the blast map (not changed in the PR), the click SHALL open that
  file on GitHub at that line (for a risk ref: the start of its range, or the file if it has none).
- **AC-10** [P1] WHEN the Overview tab of a PR with a stored brief is opened or reloaded, the system SHALL show
  that brief with no model call. Reading the brief SHALL never call the model; with no stored brief it answers
  "none yet".
- **AC-11** [P1] WHEN the user clicks Regenerate on a shown brief, the system SHALL keep the current brief
  visible with a generating indicator, make one generation (AC-3), and on success replace the stored and shown
  brief.
- **AC-12** [P1] IF a generation fails, THEN the system SHALL store nothing from it, keep the previous brief
  (or the empty state), and show an error with the reason and a Retry action. Failure cases:
  - the provider is unreachable, returns an error, or the call takes longer than 60 s;
  - the reply is still invalid after the retry;
  - the Risk Brief model's provider has no API key ("Risk Brief model not configured" + a Settings link; no
    model call is made).

  IF the PR no longer exists, THEN the system SHALL answer not found and the page SHALL show its usual "PR
  could not be loaded" state.
- **AC-13** [P1] The system SHALL read, generate and store briefs only for PRs in the requesting user's
  workspace. A request for another workspace's PR SHALL be answered as not found, with no model call. Only
  that workspace's agents give spec docs (AC-4).
- **AC-14** [P1] The system SHALL render the summary, risk titles and explanations, and focus reasons as plain
  text (no HTML, no markdown execution). Only paths that passed AC-6 are links.
- **AC-15** [P1] The system SHALL keep at most 6 risks and at most 7 Review focus items, applied after grounding
  (AC-6, AC-7). Extra risks are cut by severity (high first; equal severity → model order); extra focus items
  are cut from the end of the model's order.
- **AC-16** [P1] WHILE the PR has 0 changed files, Generate brief SHALL be disabled with the hint "This PR has
  no changed files — nothing to brief", and no model call SHALL be made.
- **AC-17** [P1] WHEN no model is set for Risk Brief in the workspace, the system SHALL use the Risk Brief
  feature's own default, `openrouter / deepseek/deepseek-v4-flash` (the same as Intent's), not the shared
  feature-model default.

P2
- **AC-18** [P2] WHILE the PR's current head commit differs from the commit the brief was generated for, the
  system SHALL show the stored brief marked "Outdated — generated for <first 7 chars of the SHA>" with a
  Regenerate action, and SHALL NOT generate automatically.
- **AC-19** [P2] WHILE a generation runs for a PR, a second generate request (double click, another tab) SHALL
  join it and receive its result: one model call in total. Reading the brief SHALL report "generating", so a
  reload or another tab shows the generating state until the result arrives.
- **AC-20** [P2] The system SHALL keep each call's input at or under 8,000 estimated tokens (characters ÷ 4, as
  in SPEC-01). It cuts in this order and stops as soon as the input fits:
  1. whole spec docs, from the end of the list;
  2. blast caller files, from the tail of the list;
  3. the hunk ranges of boilerplate files (their path and stats stay). Only files with a Smart Diff role of
     boilerplate count; with roles missing (this branch) this step cuts nothing.

  Intent, PR title and body, linked-issue references and the changed-file list (path + additions/deletions +
  role) are never cut. The brief SHALL list what was cut ("Truncated: 2 spec docs, 31 callers, hunk ranges of
  9 boilerplate files"). IF the input is still over 8,000 estimated tokens after all three cuts, THEN the
  system SHALL make no model call, store nothing, and show "PR too large for brief — <N> / 8,000 tokens".
- **AC-21** [P2] The brief SHALL show a meta line: model, input → output tokens, cost (or "cost n/a" when the
  price is unknown), the commit it was generated for, and when. This works like the Intent block's meta line.
  The cost is stored with the brief only and is not added to any agent run or to the PR-list COST column (the
  same rule as Intent).

## Edge cases

- **No Intent** (never derived, or the derivation failed): AC-5 "Intent unavailable". The Intent block keeps
  its own "Run Intent" action. The brief does not derive intent.
- **Intent computed for an older commit, or edited by the user:** the brief uses whatever the Intent block
  currently shows (a user edit wins). No extra note.
- **No blast** (repo not indexed, index failed or partial, repo intelligence off): AC-5 with the Blast block's
  reason. The grounding set is then the changed files only (AC-6).
- **0 changed files:** AC-16. **Only boilerplate files** (lock files): generated as usual; few or no risks → AC-8.
- **Very large PR:** AC-20 cuts, or "PR too large for brief". GitHub may leave out a file's patch → that file
  has no hunk ranges → its focus items are file-level (AC-7).
- **Model returns a path that is not in the PR** (invented, or a typo): dropped (AC-6). **0 risks** from the
  model → AC-8. **More than 6 risks / 7 focus items** → AC-15.
- **Risk ref with a range** (`src/x.ts:12-18`): grounded on `src/x.ts` (AC-6); the range is only used for the
  link target (AC-9).
- **Renamed or deleted file:** a rename is known only by its new path; the old path is not in the grounding set.
  A deleted file has no new-side lines → its focus items are file-level (AC-7).
- **Same head commit reopened:** stored brief, 0 model calls (AC-10).
- **New commit after generation:** outdated state (AC-18). Grounding and line snapping stay as they were at
  generation time.
- **Risk Brief model not configured** (no key for its provider): AC-12. With the feature default (AC-17) a
  workspace with an OpenRouter key works on the first click.
- **Agent disabled between generations:** its docs leave the next generation (AC-4). A stored brief is
  not changed.
- **Long content:** long paths are shortened with the full path on hover and in the accessible name. Long
  reasons wrap.

## Non-functional

- **Cost:** 1 model call per generation (≤ 1 retry, AC-3), 0 on read, reload, outdated display or click-through.
  Tests can check this with a model-call counter. Input ≤ 8,000 estimated tokens (AC-20). Call time ≤ 60 s
  (AC-12).
- **Security / scoping:** workspace-scoped (AC-13). Model output is untrusted (AC-6, AC-7, AC-14).
- **a11y:** severity is shown as text, not colour alone. Focus items and risk refs are keyboard-reachable
  buttons or links whose accessible name includes `file:line`. The generating state is announced (status
  region). Generate/Regenerate expose their disabled state.
- **i18n:** all UI text comes from the `brief` message catalog. Model-written text is English.

## Inputs (provenance)

- Intent (intent, in scope, out of scope): `[reused: L03 Intent — what the Intent block shows; 0 LLM calls; never triggers a derivation]`.
- Blast radius (summary, changed symbols, caller files, endpoints, crons; availability + reason):
  `[reused: L04 Blast radius — deterministic, repo-intel index; 0 LLM calls]`.
- Changed files (path, additions, deletions) and hunk ranges: `[deterministic: PR files and their patch headers]`.
- Roles core / wiring / boilerplate: `[reused: L03 Smart Diff — deterministic]`. Optional; always missing on
  this branch (AC-5).
- PR title and body: `[deterministic: PR data]`.
- Linked issue: `[reused: L03 Intent sources]` — only issues the Intent layer recorded as read; no extra
  fetches. The Intent store keeps a reference per source (issue number + ref), not the issue text, so the brief
  gets the reference only. No issue → fine.
- Spec docs: `[reused: SPEC-01/03 attachments of enabled agents]`, 4,000-token cap (AC-4). Skill-inherited
  docs (SPEC-05): not on any branch yet → SPEC-07.
- Summary, risks, review focus: `[new: 1 LLM call per generation]`, Risk Brief feature model (default AC-17),
  ≤ 8,000 input tokens. The output token cap is set by the plan.
- Grounding, line snapping, caps, outdated check: `[deterministic: changed files + hunk ranges + blast map + head commit]`.

## Untrusted inputs

The PR title and body, issue references, spec docs, file paths, symbol and caller names are written by anyone
who can open a PR or push to the repo. They go to the model as delimited data under an injection guard, never as
instructions. Instructions or role changes inside them don't change what the generator does, and no keyword
filter replaces this wrapping. The model's reply is untrusted too: paths are grounded (AC-6), lines are
snapped (AC-7), counts are capped (AC-15), the text is shown as plain text (AC-14), and invalid replies are
rejected (AC-3, AC-12). GitHub links (AC-9) are built only from grounded blast-map paths.

## Module interactions

- **Intent (L03, server):** read-only source of the intent the Intent block shows and of the linked-issue
  references. Unavailable → AC-5. The Intent block on Overview is reused as it is.
- **Blast radius (L04, server) / repo-intel:** computed blast result and its honest availability reason (the
  same one the Blast block shows). Slow or unavailable → AC-5. The Blast block is reused as it is.
- **Smart Diff (L03):** not a dependency. Smart Diff is not on `main` (reverted in PR #27); it exists only on
  `feat/smart-diff-l03`, which has no Blast radius and no Project Context. Decided (user, 2026-11-08): the
  brief branch `feat/pr-brief` is cut from `feat/sdd-agents`. Roles are a missing input (AC-5), the third
  budget cut does nothing (AC-20), and the click lands in the flat Files changed list (AC-9).
- **Project Context (SPEC-01/03, server):** attachments of enabled agents (AC-4). SPEC-05 (skill ↔ doc
  attachments) is approved but not implemented — no table stores skill attachments — so it is not an input. Repo not cloned
  → its repo docs count as "missing", as in SPEC-01 AC-10. Generation goes ahead.
- **Settings (feature models, API keys):** the Risk Brief model and key (AC-12, AC-17), and pricing for AC-21.
  The feature's own default is mirrored in the client's feature-model list; the shared `FEATURE_MODELS` in
  vendor/shared is not edited.
- **reviewer-core, MCP server:** not involved.

## Design review

Sources: the two user screenshots (Overview with the brief; Files changed after a focus click),
`docs/design/devdigest-2/screen_pr_detail.jsx` (`BriefCard`, `BriefEmpty`, `BriefSkeleton`, `RiskPillRow`,
`ReviewFocusBlock`) and `data.jsx` (`RISKS`, `REVIEW_FOCUS`), the current Overview and Files-changed tabs, the
`brief` message catalog, and the shared brief contract. Live system: not checked.

Decisions (user, 2026-11-08):
- **Contract:** the shared PR-brief contract (`PrBrief` in vendor/shared) is **not extended**. Vendor/shared is
  do-not-touch, and `/pr-self-review` blocks any edit there as a non-waivable critical. It also requires
  `history`, which is a Non-goal here. The brief's response is owned by the server feature and mirrored on the
  client. It reuses the shared `Risk`, `RiskSeverity`, `Intent` and `BlastRadius` shapes unchanged. The new
  parts (summary, review focus, generated-for commit, missing inputs, truncated inputs, model/usage) are stored
  with the brief in the existing per-PR brief store.
- **Base branch:** `feat/sdd-agents`; Smart Diff roles always missing; click → flat list (Module interactions).
- **Scope:** P1 + P2 here; the three P3 criteria moved to SPEC-07 ([../client/specs/pr-brief-extras.md](../client/specs/pr-brief-extras.md)).
- **Default model:** module-local `openrouter / deepseek/deepseek-v4-flash`, like Intent (AC-17).
- **Metadata only:** risks and focus come from paths, roles, stats, intent, blast, docs and the PR description;
  no code-level findings (Non-goals). The design's examples ("live Stripe key sk_live_… committed", "N+1 query")
  and its summary citing findings and blockers need code the model never sees; they overstate what the brief
  can know.
- **Spec docs:** union over enabled agents' own attachments, agents by name, de-duplicated by path (AC-4).
  Amended 2026-11-08 after implementation-planner found SPEC-05 unimplemented: skill-inherited docs → SPEC-07.
- **Blast-only focus items** keep the model's line, no snapping (AC-7); the click opens GitHub at that line
  (AC-9). Amended 2026-11-08 (AC-7 vs AC-9 conflict found by implementation-planner).
- **Lines:** out-of-range lines snap to the nearest hunk, ties to the earlier one; a file with no hunks gives a
  file-level item (AC-7).
- **Budget:** 8,000 tokens, cut order and never-cut list in AC-20; still too large → no call, "PR too large for
  brief" with the numbers.
- **Retries / timeout:** 1 retry on an invalid reply (AC-3); 60 s per call (AC-12).
- **Risk refs with ranges** (`ratelimit.ts:12-18`): a ref is `path` or `path:start-end`; grounding matches the
  path, the range is used for the link (AC-6, AC-9). Clicking a ref behaves like a focus click.
- **Blast-only files:** a focus item or ref on a file that is only in the blast map opens GitHub at that file
  and line (AC-9).
- **Caps:** ≤ 6 risks (cut by severity, then model order), ≤ 7 focus items (cut by model order) (AC-15).
- **0 changed files:** Generate disabled with a hint (AC-16).
- **Intent:** whatever the Intent block currently shows. **Linked issue:** only issues Intent already read, no
  extra fetches (reference only, see Inputs).
- **Copy:** `unavailable` / `unavailableHint` ("Run a review or open the PR to compute it") contradict
  click-only generation → replaced with "No brief yet." / "Generate a Why + Risk brief for this PR — one model
  call." `block.risks` "Risks" → "Risk areas". New strings (summary, review focus, generate, regenerate,
  generating, outdated, missing inputs, truncated, too large, no files, no focus items, not configured) go into
  the same catalog.

Proposals kept from the design review (no objection raised):
- **Intent + Blast always stay visible.** The design's `BriefEmpty` / `BriefSkeleton` replace the whole card,
  which would hide blocks that show today. Only the summary, risks and focus have empty, skeleton and error
  states (AC-1, AC-2).
- **Risk kind icons** (security, db_migration, breaking_api, perf, deps in the design): the icon comes from the
  kind, and an unknown kind gets a generic icon. Severity colours: high = critical, medium = warning, low = info
  tokens.
- **Description section** on Overview (not in the screenshot): kept below the brief, unchanged.
- **States covered:** empty (AC-1), no files (AC-16), generating (AC-2, AC-11, AC-19), ready (AC-2), error
  (AC-12), too large (AC-20), outdated (AC-18), missing inputs (AC-5), truncated (AC-20), no risks / no focus
  (AC-8), not configured (AC-12).

## [NEEDS CLARIFICATION]

None.
