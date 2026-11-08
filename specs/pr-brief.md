# Spec: PR Why + Risk Brief   |   Spec ID: SPEC-06   |   Status: draft
Modules: server · client
Related: [project-context-folder.md](project-context-folder.md) (SPEC-01, doc selection + 4K cap),
[project-context-for-skills.md](project-context-for-skills.md) (SPEC-05, inherited docs),
[../server/specs/intent-layer.md](../server/specs/intent-layer.md) (L03 Intent), [../plans/blast-radius.md](../plans/blast-radius.md) (L04).

## Problem and why

A reviewer opens someone else's PR cold. They don't know why it exists, what is risky in it, or where to start
reading. The answers are scattered across the Intent block (L03), Smart Diff roles (L03) and Blast radius (L04).
The **PR Brief** on the Overview tab brings these facts together. It adds two parts written by a model:
**Risk areas** and **Review focus — read these first**. Each brief costs exactly one model call, made only when
the user asks. The model gets precomputed facts only, never diff code.

## Goals / Non-goals

Goals (P1 = definition of done)
1. The Overview tab has a PR Brief block. While no brief exists, the block shows **Generate brief**.
2. A generated brief has five parts: Summary (2–4 sentences: what and why), the existing Intent and Blast
   radius blocks side by side, Risk areas, and Review focus.
3. Clicking a Review focus item opens Files changed (`?tab=diff`) with that file expanded and scrolled into
   view (P1). Scrolling to the exact line is P3.
4. After a reload the stored brief shows at once, with no model call.
5. Regenerate replaces the stored brief.

Non-goals
- The model never reads diff code (hunk bodies). It gets hunk line ranges only.
- No change to Intent, Blast radius or Smart Diff, or to how they are generated. The brief only reads their
  stored or computed results. Generating a brief never starts an Intent derivation.
- No automatic generation when a PR is opened, synced or gets a new commit. Generation is click-only, because
  each one costs money.
- No prior-PR history (L04 P3) in the brief. The Blast block keeps its own "Prior PRs" section.
- The brief is not a re-review: it produces no findings and no verdict of its own.
- No brief history or versions. Only the latest brief per PR is stored.
- No MCP tool for the brief.

## User stories

- As a reviewer, I open PR #482, click Generate brief, and in under a minute I know why the PR exists, which 3
  areas are risky, and which 4 places to read first.
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
  - Risk areas under Intent: each item shows a title, its severity (high / medium / low) as a coloured icon
    plus a text label, and its file refs;
  - a full-width "Review focus — read these first (N)" list of `file:line — reason` items, in the order the
    model gave (= read first).
- **AC-3** [P1] For each generation the system SHALL make exactly one model call to the Risk Brief feature
  model (Settings → Risk Brief), plus at most [NEEDS CLARIFICATION: number of retries — proposal: 1] retry when
  the reply fails validation. The call's input SHALL be built only from the inputs listed in Inputs
  (provenance). For each changed file it gets the path, additions, deletions, Smart Diff role and the hunk line
  ranges (e.g. `@@ -38,9 +40,13 @@`). It SHALL contain no line of diff content.
- **AC-4** [P1] The spec-docs input SHALL be the docs attached for this repo to every enabled agent of the
  workspace, including docs inherited from enabled linked skills (SPEC-05 AC-6). Each doc appears once. The
  SPEC-01 selection rules apply (whole docs, "too large", "over cap", "missing") with one 4,000-token cap, in the
  order [NEEDS CLARIFICATION: union order across agents — proposal: agents by name, each agent's SPEC-05 merged
  order]. No attached docs → generation goes ahead without them.
- **AC-5** [P1] IF the Intent, the Blast radius or the Smart Diff roles are unavailable for the PR, THEN the
  system SHALL still generate the brief. The brief SHALL show a "Missing inputs" note naming each one with its
  reason, e.g. "Intent unavailable — not derived yet", "Blast radius unavailable — <reason>". The blast reason
  SHALL be the same one the Blast radius block shows for that PR (index missing, failed or partial, or repo
  intelligence off). A PR without a linked issue or without attached docs is not "missing".
- **AC-6** [P1] Before saving, the system SHALL drop every risk file ref and every Review focus item whose file
  is neither a changed file of the PR nor (when the blast radius is available) a file in its blast map. A risk
  left with no file ref SHALL be dropped. Model-supplied paths never become links unless they pass this check.
- **AC-7** [P1] Each kept Review focus item SHALL have a positive whole-number line. IF the line is outside
  every changed hunk (new side) of that file, THEN the system SHALL move it to the first line of the nearest
  changed hunk (on a tie, the earlier hunk). IF the file has no new-side hunk lines (binary, pure rename,
  deleted, or patch not provided by GitHub), THEN the item SHALL be file-level: stored as line 1 and shown as
  `file — reason`, with no line. Items that become duplicates (same file and line) keep the first.
- **AC-8** [P1] IF no risks remain after AC-6, THEN Risk areas SHALL show "No notable risks flagged." IF no
  Review focus items remain, THEN the list SHALL show "No review focus items." Neither case is an error.
- **AC-9** [P1] WHEN the user clicks a Review focus item for a changed file, the system SHALL switch to
  `?tab=diff` and expand that file. If the file's Smart Diff group is folded, the group is unfolded too. The
  page SHALL scroll so the file's header is visible. This SHALL work in Smart order and in Original order.
  [NEEDS CLARIFICATION: target of an item whose file is only in the blast map (not changed) — proposal: open
  the file on GitHub at the commit the Blast block links to, at the given line.]
- **AC-10** [P1] WHEN the Overview tab of a PR with a stored brief is opened or reloaded, the system SHALL show
  that brief with no model call. Reading the brief SHALL never call the model; with no stored brief it answers
  "none yet".
- **AC-11** [P1] WHEN the user clicks Regenerate on a shown brief, the system SHALL keep the current brief
  visible with a generating indicator, make one generation (AC-3), and on success replace the stored and shown
  brief.
- **AC-12** [P1] IF a generation fails, THEN the system SHALL store nothing from it, keep the previous brief
  (or the empty state), and show an error with the reason and a Retry action. Failure cases:
  - the provider is unreachable, returns an error, or the call exceeds [NEEDS CLARIFICATION: time limit —
    proposal: 60 s];
  - the reply is still invalid after the retry;
  - the Risk Brief model's provider has no API key ("Risk Brief model not configured" + a Settings link; no
    model call is made).

  IF the PR no longer exists, THEN the system SHALL answer not found and the page SHALL show its usual "PR
  could not be loaded" state.
- **AC-13** [P1] The system SHALL read, generate and store briefs only for PRs in the requesting user's
  workspace. A request for another workspace's PR SHALL be answered as not found, with no model call. Only
  that workspace's agents and skills give spec docs (AC-4).
- **AC-14** [P1] The system SHALL render the summary, risk titles and explanations, and focus reasons as plain
  text (no HTML, no markdown execution). Only paths that passed AC-6 are links.

P2
- **AC-15** [P2] WHILE the PR's current head commit differs from the commit the brief was generated for, the
  system SHALL show the stored brief marked "Outdated — generated for <first 7 chars of the SHA>" with a
  Regenerate action, and SHALL NOT generate automatically.
- **AC-16** [P2] WHILE a generation runs for a PR, a second generate request (double click, another tab) SHALL
  join it and receive its result: one model call in total. Reading the brief SHALL report "generating", so a
  reload or another tab shows the generating state until the result arrives.
- **AC-17** [P2] The system SHALL keep each call's input at or under 8,000 estimated tokens (characters ÷ 4, as
  in SPEC-01). It cuts in this order and stops as soon as the input fits:
  1. whole spec docs, from the end of the list;
  2. blast caller files, from the tail of the list;
  3. the hunk ranges of boilerplate files (their path and stats stay).

  Intent, PR title and body, and the changed-file list (path + stats) are never cut. The brief SHALL list what
  was cut ("Truncated: 2 spec docs, 31 callers, hunk ranges of 9 boilerplate files").
  [NEEDS CLARIFICATION: what happens if the input is still over 8,000 tokens after all three cuts (e.g. a
  2,000-file PR or a huge PR body) — proposal: no model call, error "PR too large for a brief".]
- **AC-18** [P2] The brief SHALL show a meta line: model, input → output tokens, cost (or "cost n/a" when the
  price is unknown), the commit it was generated for, and when. This works like the Intent block's meta line.
  The cost is stored with the brief only and is not added to any agent run or to the PR-list COST column (the
  same rule as Intent).

P3
- **AC-19** [P3] WHERE the PR has at least one review, the summary banner SHALL also show the latest review's
  verdict, its finding and blocker counts, and the PR score, as on the Agent runs tab.
  [NEEDS CLARIFICATION: "latest review" when several agents ran — proposal: the most recent finished run.]
  With no review, the banner shows the summary only.
- **AC-20** [P3] WHEN the user expands a risk item, the system SHALL show its explanation and all its file refs.
- **AC-21** [P3] WHEN a Review focus item has a line (AC-7), the click (AC-9) SHALL scroll to that line and
  highlight it.

## Edge cases

- **No Intent** (never derived, or the derivation failed): AC-5 "Intent unavailable". The Intent block keeps
  its own "Run Intent" action. The brief does not derive intent.
- **No blast** (repo not indexed, index failed or partial, repo intelligence off): AC-5 with the Blast block's
  reason. The grounding set is then the changed files only (AC-6).
- **0 changed files:** [NEEDS CLARIFICATION: proposal: Generate is disabled with "This PR has no changed files";
  no model call.] **Only boilerplate files** (lock files): generated as usual; few or no risks → AC-8.
- **Very large PR:** AC-17 cuts. GitHub may leave out a file's patch → that file has no hunk ranges → its focus
  items are file-level (AC-7).
- **Model returns a path that is not in the PR** (invented, or a typo): dropped (AC-6). **0 risks** from the
  model → AC-8.
- **Renamed or deleted file:** a rename is known only by its new path; the old path is not in the grounding set.
  A deleted file has no new-side lines → its focus items are file-level (AC-7).
- **Same head commit reopened:** stored brief, 0 model calls (AC-10).
- **New commit after generation:** outdated state (AC-15). Grounding and line snapping stay as they were at
  generation time.
- **Risk Brief model not configured** (no key for its provider): AC-12. The built-in default for Risk Brief is
  `openai / gpt-4.1`, so a workspace with only an OpenRouter key hits this on the first click (see Design review).
- **Intent computed for an older commit, or edited by the user:** [NEEDS CLARIFICATION: proposal: use the intent
  the Intent block shows (a user edit wins); if it was computed for another commit, use it and add "intent from
  an older commit" to Missing inputs.]
- **Agent or skill disabled between generations:** its docs leave the next generation (AC-4). A stored brief is
  not changed.
- **Long content:** long paths are shortened with the full path on hover and in the accessible name. Long
  reasons wrap.

## Non-functional

- **Cost:** 1 model call per generation (≤ 1 retry, AC-3), 0 on read, reload, outdated display or click-through.
  Tests can check this with a model-call counter. Input ≤ 8,000 estimated tokens (AC-17).
- **Security / scoping:** workspace-scoped (AC-13). Model output is untrusted (AC-6, AC-7, AC-14).
- **a11y:** severity is shown as text, not colour alone. Focus items and risk refs are keyboard-reachable
  buttons or links whose accessible name includes `file:line`. The generating state is announced (status
  region). Generate/Regenerate expose their disabled state.
- **i18n:** all UI text comes from the `brief` message catalog. Model-written text is English.

## Inputs (provenance)

- Intent (intent, in scope, out of scope): `[reused: L03 Intent — stored result; 0 LLM calls; never triggers a derivation]`.
- Blast radius (summary, changed symbols, caller files, endpoints, crons; availability + reason):
  `[reused: L04 Blast radius — deterministic, repo-intel index; 0 LLM calls]`.
- Changed files (path, additions, deletions) and hunk ranges: `[deterministic: PR files and their patch headers]`.
- Roles core / wiring / boilerplate: `[reused: L03 Smart Diff — deterministic]`. Optional.
- PR title and body: `[deterministic: PR data]`. Linked issue: [NEEDS CLARIFICATION: source of the issue —
  proposal: the issue(s) the Intent layer recorded as read (title + body fetched at generation, cut like PR text
  — confirm whether issue text may be truncated, as it is not in AC-17's never-cut list)]. No issue → fine.
- Spec docs: `[reused: SPEC-01/03/05 attachments of enabled agents and their skills]`, 4,000-token cap.
- Summary, risks, review focus: `[new: 1 LLM call per generation]`, Risk Brief feature model, ≤ 8,000 input
  tokens. The output token cap is set by the plan.
- Grounding, line snapping, outdated check: `[deterministic: changed files + hunk ranges + blast map + head commit]`.
- P3 verdict, counts, score: `[reused: stored review runs]`, 0 LLM calls.

## Untrusted inputs

The PR title and body, issue text, spec docs, file paths, symbol and caller names are written by anyone who
can open a PR or push to the repo. They go to the model as delimited data under an injection guard, never as
instructions. Instructions or role changes inside them don't change what the generator does, and no keyword
filter replaces this wrapping. The model's reply is untrusted too: paths are grounded (AC-6), lines are
snapped (AC-7), the text is shown as plain text (AC-14), and invalid replies are rejected (AC-3, AC-12).

## Module interactions

- **Intent (L03, server):** read-only source of the stored intent. Unavailable → AC-5. The Intent block on
  Overview is reused as it is.
- **Blast radius (L04, server) / repo-intel:** computed blast result and its honest availability reason (the
  same one the Blast block shows). Slow or unavailable → AC-5. The Blast block is reused as it is.
- **Smart Diff (L03):** roles per file, and the grouped Files changed view the click lands in (AC-9). Smart
  Diff is not on `main` (reverted in PR #27); it exists only on `feat/smart-diff-l03`, merged into
  `local/all-lessons`. Without it, roles are "missing" (AC-5) and the click lands in the plain file list.
  [NEEDS CLARIFICATION: should the brief branch stack on `feat/smart-diff-l03`, or ship with roles always missing?]
- **Project Context (SPEC-01/03/05, server):** attachments of enabled agents and skills (AC-4). Repo not cloned
  → its repo docs count as "missing", as in SPEC-01 AC-10. Generation goes ahead.
- **Settings (feature models, API keys):** the Risk Brief model and key (AC-12), and pricing for AC-18.
- **Reviews (P3):** latest review verdict, counts and score (AC-19). Read-only.
- **reviewer-core, MCP server:** not involved.

## Design review

Sources: the two user screenshots (Overview with the brief; Files changed after a focus click),
`docs/design/devdigest-2/screen_pr_detail.jsx` (`BriefCard`, `BriefEmpty`, `BriefSkeleton`, `RiskPillRow`,
`ReviewFocusBlock`) and `data.jsx` (`RISKS`, `REVIEW_FOCUS`), the current Overview and Files-changed tabs, the
`brief` message catalog, and the shared brief contract. Live system: not checked.

Decisions (from the user):
- The shared PR-brief contract (`PrBrief` in vendor/shared) is **not extended**. Vendor/shared is do-not-touch,
  and `/pr-self-review` blocks any edit there as a non-waivable critical. It also requires `history`, which is a
  Non-goal here. The brief's response is owned by the server feature and mirrored on the client. It reuses the
  shared `Risk`, `RiskSeverity`, `Intent` and `BlastRadius` shapes unchanged. The new parts (summary, review
  focus, generated-for commit, missing inputs, truncated inputs, model/usage) are stored with the brief in
  the existing per-PR brief store.
- Spec docs = union over enabled agents (AC-4). Out-of-range lines are snapped (AC-7). The budget and cut order
  are in AC-17. A file with no hunks makes its focus items file-level (AC-7, decided here as asked).

Gaps and conflicts found:
- **Catalog copy contradicts click-only:** `unavailable` / `unavailableHint` ("Run a review or open the PR to
  compute it") → replace with "No brief yet." / "Generate a Why + Risk brief for this PR — one model call."
  `block.risks` "Risks" → "Risk areas" as in the design. New strings (summary, review focus, generate,
  regenerate, generating, outdated, missing inputs, truncated, no focus items, not configured) go into the same
  catalog.
- **Design hides Intent + Blast in the empty and loading states** (`BriefEmpty` / `BriefSkeleton` replace the
  whole card). That would hide blocks that show today. → Proposal: Intent and Blast always stay; only the
  summary, risks and focus have empty, skeleton and error states (AC-1, AC-2).
- **Design examples need code the model never sees** ("live Stripe key sk_live_… committed", "N+1 query"), and
  the design's summary cites findings and blockers. With hunk ranges only, risks and focus come from paths,
  roles, intent, blast and docs. The examples overstate what the brief can know. Verdict and findings come only
  from reviews (AC-19).
- **Risk refs with ranges** (`ratelimit.ts:12-18`) and the design's risk click → diff: the contract's
  `file_refs` are plain strings. → Proposal: a ref is `path` or `path:start-end`. The path is grounded (AC-6)
  and the range is kept only if it overlaps a changed hunk. Clicking a ref behaves like a focus click (AC-9).
  [NEEDS CLARIFICATION: accept?]
- **Risk kind icons** (security, db_migration, breaking_api, perf, deps in the design) → the icon comes from the
  kind, and an unknown kind gets a generic icon. Severity colours: high = critical, medium = warning, low = info
  tokens.
- **Item limits** are not in the design (it shows 3 risks and 4 focus items). [NEEDS CLARIFICATION: caps —
  proposal: ≤ 6 risks, ≤ 7 focus items; extras dropped after grounding.]
- **Default model:** Risk Brief defaults to `openai / gpt-4.1`, while the seeded setup uses OpenRouter. →
  Proposal: a module-local default matching Intent's (`openrouter / deepseek/deepseek-v4-flash`), mirrored in
  the client's feature-model list. Shared `FEATURE_MODELS` stays untouched.
- **Description section** on Overview is not in the screenshot. → Proposal: keep it below the brief, unchanged.
- **States covered:** empty (AC-1), generating (AC-2, AC-11, AC-16), ready (AC-2), error (AC-12), outdated
  (AC-15), missing inputs (AC-5), truncated (AC-17), no risks / no focus (AC-8), not configured (AC-12).

## [NEEDS CLARIFICATION]

- [NEEDS CLARIFICATION: number of retries on an invalid reply — proposal: 1] (AC-3)
- [NEEDS CLARIFICATION: union order of spec docs across agents — proposal: agents by name, each agent's SPEC-05 merged order] (AC-4)
- [NEEDS CLARIFICATION: target of a focus item whose file is only in the blast map — proposal: GitHub at the Blast link commit and line] (AC-9)
- [NEEDS CLARIFICATION: generation time limit — proposal: 60 s] (AC-12)
- [NEEDS CLARIFICATION: input still over 8,000 tokens after all cuts — proposal: no model call, "PR too large for a brief"] (AC-17)
- [NEEDS CLARIFICATION: "latest review" with several agents — proposal: most recent finished run] (AC-19)
- [NEEDS CLARIFICATION: 0 changed files — proposal: Generate disabled, "This PR has no changed files"] (Edge cases)
- [NEEDS CLARIFICATION: stale or user-edited intent — proposal: use what the Intent block shows; older commit → noted in Missing inputs] (Edge cases)
- [NEEDS CLARIFICATION: linked-issue source and whether its text may be cut — proposal: issues the Intent layer read, cut after spec docs] (Inputs)
- [NEEDS CLARIFICATION: stack the brief branch on `feat/smart-diff-l03`, or ship with roles always missing?] (Module interactions)
- [NEEDS CLARIFICATION: risk refs `path:start-end`, grounded path + range kept only if it overlaps a hunk, click = focus click — accept?] (Design review)
- [NEEDS CLARIFICATION: caps on risks / focus items — proposal: ≤ 6 / ≤ 7] (Design review)
