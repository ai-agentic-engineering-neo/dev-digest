# Spec: PR Brief extras — verdict banner, risk expand, exact-line focus, visual parity   |   Spec ID: SPEC-07   |   Status: approved
Modules: client
Supersedes: [../../specs/pr-brief.md](../../specs/pr-brief.md) — only SPEC-06 AC-2 (how a risk item is laid out: explanation
behind an expand toggle) and AC-9 (click target for a changed file: the line, not only the header). Everything
else in SPEC-06 stays as approved.
Related: SPEC-06 [../../specs/pr-brief.md](../../specs/pr-brief.md) (the PR Brief this extends; implemented on `feat/pr-brief`).

## Problem and why

SPEC-06 tells a reviewer why a PR exists, what is risky and where to start reading. Three things are still
missing. The Overview does not show how the PR did in review: the verdict and score are only on the Agent runs
tab. Each risk shows its whole explanation at once, so the list is long. A Review focus click lands on the file
header, not on the line. Also, the brief looks flat: every block is grey, so nothing stands out. This P3
follow-up adds the review outcome to the brief and makes the brief look like the design. It adds no new model
call, server read or API change.

## Goals / Non-goals

Goals
1. The PR Brief's summary sits in a verdict banner. The banner shows the newest finished review run's verdict,
   finding/blocker counts and PR score, as on the Agent runs tab.
2. Risk rows are compact. Each one expands to show its explanation and all its file refs.
3. A Review focus item or risk ref with a line scrolls Files changed to that line and highlights it.
4. The brief looks like the screenshots: section labels with icons, risk cards coloured by severity, accent
   file links, a warning-style "Missing inputs" note. Only existing design-system parts and colours are used.

Non-goals
- No change to brief generation, the model call, the cache, the stored brief or the brief API (SPEC-06 as is).
- No new server endpoint or field. The banner reads only the review and run data the PR page already loads
  (see Module interactions).
- Skill-inherited spec docs as a brief input (stub AC-4, moved here from SPEC-06) are **deferred**. This is
  server work and needs SPEC-05 to be implemented first. It goes into a future server spec written after
  SPEC-05 ships. SPEC-06 AC-4 / Inputs still say "see SPEC-07"; that pointer now ends at this note.
- No aggregate verdict over several agents. The banner shows one run: the newest finished one.
- No "reviewed for commit X" marker on the verdict. The client has no reviewed-commit data; accepted for P3
  (user decision, 2026-11-09). The brief keeps its own Outdated state (SPEC-06 AC-18).
- No change to the Agent runs tab's verdict banner, its counts or its score.
- No Smart Diff work on this branch: Files changed is the flat list (SPEC-06 Module interactions).
- No brief history, no running a review from the banner, no new colours or design tokens.

## User stories

- As a reviewer, I open PR #482's Overview and see at once "Request changes · 6 findings · 2 blockers · 61"
  next to the brief's summary of what the PR does. I don't have to open Agent runs.
- As a reviewer, I scan three compact risk cards. I expand only the one I care about to read why it is risky.
- As a reviewer, I click `src/middleware/ratelimit.ts:52 — …` and land on line 52 in Files changed, with the line
  highlighted, not at the top of a long file.

## Acceptance criteria (EARS)

Verdict banner
- **AC-1** WHERE the PR has at least one finished review run, the Overview SHALL show, under a "PR Brief"
  section label at the top, one banner with: that run's verdict (icon and label in the verdict's colour, as on
  the Agent runs tab); a chip "N findings · M blockers" (the blocker part only when M > 0); the PR score circle
  labelled "PR score" when the run has a score; and the brief summary (SPEC-06) as the banner text.
- **AC-2** The run used SHALL be the newest finished review run (decided 2026-11-08). Its stored review is the
  most recently saved review of the PR whose run has status done. A stored review with no linked run also
  counts as finished. Reviews whose run is running, failed or cancelled SHALL be skipped. With no such review,
  AC-4 applies.
- **AC-3** For that review, "findings" SHALL be the count of all its stored findings, dismissed ones included.
  "Blockers" SHALL be its Critical findings that are not dismissed. Both counts SHALL equal what the Agent runs
  tab's banner shows for the same run. The score circle SHALL keep the kit's own colour thresholds (ok from 75,
  warning from 50; client INSIGHTS 2026-11-06). A run with no score SHALL show no circle and no "PR score" label.
- **AC-4** IF the PR has no finished review run, THEN the brief card SHALL look and behave as in SPEC-06 (no
  verdict, chip, score or provenance control). IF the review or run data fails to load, THEN the card SHALL
  also show the note "Review verdict unavailable" with a Retry action, and the brief itself stays usable.
- **AC-5** WHILE a finished review run exists, the banner SHALL keep its verdict, chip and score in every brief
  state. In the text area: no brief → "No brief yet" with Generate brief and the model name (SPEC-06 AC-1);
  generating, error, outdated and no-files → as SPEC-06 AC-2/11/12/16/18; ready → the summary. Generate /
  Regenerate keep their SPEC-06 behaviour and accessible names.
- **AC-6** WHEN a review run of the PR finishes, or the newest one is deleted, while the Overview tab is open,
  the banner SHALL show the new newest finished run (or AC-4) within 10 s, with no reload. Showing or updating
  the banner SHALL make 0 model calls.
- **AC-7** The banner SHALL have an info control. It works with mouse hover and keyboard focus, and its text
  is in the accessible name. It says that verdict, findings and score come from `<agent name>`'s review run
  of `<date/time>`, and that summary, risks and review focus come from the brief.

Risk areas
- **AC-8** Each risk SHALL first show a collapsed card with: a kind icon, the title, a severity text label, the
  first file ref, "+N more" when it has more refs, and an expand toggle. The toggle is a keyboard-operable
  button that exposes its expanded state; its accessible name includes the risk title. WHEN the user expands
  a risk, the system SHALL show its explanation (plain text, SPEC-06 AC-14) and all its file refs. Collapsing
  hides them again. Each risk toggles on its own. All start collapsed on every page load.

Exact-line focus
- **AC-9** WHEN the user clicks a Review focus item that has a line (not file-level, SPEC-06 AC-7), or a risk
  ref with a range, for a changed file, the system SHALL open Files changed with that file expanded. It SHALL
  scroll so the target line is in view and highlight it, and move keyboard focus to it. The target line is the
  new-side line with that number (an added or unchanged line). For a range, it is the range start, and every
  rendered new-side line in the range is highlighted. The highlight SHALL stay until the user opens another
  target or leaves the tab. Reloading the Files changed page reached this way SHALL scroll and highlight again.
- **AC-10** WHEN the click target has no line (a file-level focus item, or a risk ref without a range), the
  system SHALL behave as SPEC-06 AC-9: scroll to the file header. IF the target line is not rendered in that
  file (outside every hunk, a removed-only line, or the file has no patch from GitHub), THEN the system SHALL
  scroll to the file header. It SHALL show the note "Line N isn't part of this diff — showing the file" next to
  that file and highlight no line. Clicks on blast-only files SHALL keep opening GitHub (SPEC-06 AC-9).

Visual parity (every colour SHALL come from an existing design token; no new token is added)
- **AC-11** The headings "PR Brief", "Risk areas" and "Review focus — read these first" SHALL be styled like
  the Intent and Blast radius section labels: an icon plus an uppercase label. The Review focus heading SHALL
  show the item count in a badge in place of "(N)" in the text.
- **AC-12** The brief SHALL be styled as follows:
  - Risk cards have a border. The kind icon is coloured by severity: high = critical/danger, medium = warning,
    low = info. An unknown kind gets the generic warning icon. Severity is never shown by colour alone (AC-8).
  - Clickable file refs and focus paths are monospace in the accent colour, with a hover state and a visible
    keyboard focus ring. Refs that can't be opened (no repository or commit to link to) stay muted, not accent.
  - "Missing inputs" (SPEC-06 AC-5) is a subtle warning note: a warning icon and warning-tinted border or
    background, with readable text.
  - The meta line (model · tokens · cost · commit · when) stays small and muted.

## Edge cases

- **0 findings in the newest run:** chip "0 findings", no blocker part; the verdict is still shown.
- **Only failed / cancelled / running runs:** no finished review → AC-4. A review stored by a run that then
  failed during its final steps is skipped (AC-2).
- **Several agents ran:** only the newest finished run is shown; the info control names the agent (AC-7).
- **Findings dismissed after the run:** the findings count stays the same and the blocker count goes down (AC-3),
  the same as on the Agent runs tab.
- **Brief outdated (SPEC-06 AC-18) and verdict from another commit:** both are shown with no marker on the
  verdict (Non-goals; accepted for P3, user decision 2026-11-09).
- **Risk with one ref and an empty explanation:** no "+N more"; expanding shows only the ref.
- **Risk ref range partly outside the hunks:** the range start is the target. If the start is not rendered → AC-10.
- **Line exists in the file but not in the diff** (unchanged code outside hunks, or the diff changed after an
  outdated brief): AC-10 fallback with the note.
- **Large file** (over the auto-expand size): the focused file is always expanded (SPEC-06), so its lines render.
- **Long paths / long risk titles:** shortened with the full path on hover and in the accessible name
  (SPEC-06); cards wrap and never overflow the column.
- **Narrow window:** the score circle and the banner text stack and do not overlap.

## Non-functional

- **Cost:** 0 model calls for everything here. The banner adds no server request beyond the review and run
  lists the PR page already loads.
- **a11y:** verdict and severity are shown as text, never by colour alone. The expand toggles, refs and focus
  items can be reached and used with the keyboard and show a focus ring. After an exact-line jump, keyboard
  focus is on the target line, or on the file header for a fallback. The fallback note is announced.
- **i18n:** new UI strings come from the brief catalog. The verdict labels and "PR score" reuse the Agent runs
  tab's existing strings.
- **Theming:** works in dark and light themes; the existing CSS-variable guard test passes.

## Inputs (provenance)

- Verdict, findings, blockers, score, agent name, review time: `[reused: stored review runs + run statuses the PR
  page already loads]`, 0 LLM calls.
- Summary, risks (title, kind, severity, explanation, refs), review focus, missing inputs, meta:
  `[reused: SPEC-06 stored brief]`, 0 LLM calls.
- Rendered lines of each changed file: `[deterministic: PR file patches already loaded for Files changed]`.

## Untrusted inputs

The review summary is not shown. The brief summary, risk titles and explanations, focus reasons and paths are
model output; agent names come from the workspace. All of these stay plain text (SPEC-06 AC-14). Only
grounded paths become links (SPEC-06 AC-6). The exact-line target comes only from the stored, grounded line or
range. A line that is not in the rendered diff is never invented (AC-10).

## Module interactions

- **Server — none changed.** Evidence (branch `feat/pr-brief`): the PR page already loads the PR's stored
  reviews (newest first; each with verdict, summary, score, agent name, run link, saved time and findings with
  severity and dismissed state) and the PR's run history with each run's status. A review is saved at the end
  of a successful run, just before the run is marked done. So the newest finished review can be told apart on
  the client (AC-2). The run history is already polled while a run is active, which is enough for AC-6.
- **Agent runs tab:** its banner is reused as is; its behaviour does not change.
- **Files changed (flat list on this branch):** adds a line target to SPEC-06's file deep link. The
  `local/all-lessons` run copy has Smart Diff, where a file deep link switches to Original order
  (client/INSIGHTS.md 2026-11-09, FileCard entry). The line target must behave the same there; re-apply it on
  merge. This is not a criterion of this branch.
- **Review data unavailable or slow:** AC-4 (the brief still works). **Brief unavailable:** SPEC-06 states.
- **e2e flow 13** (seeded #482: summary text, then the first focus item) must keep passing. It checks text
  that still shows after this change.

## Design review

Sources: the two screenshots of 2026-11-09 (Overview banner; Risk areas cards + Review focus with a count
badge), `docs/design/devdigest-2/screen_pr_detail.jsx` (`BriefCard`, `RiskPillRow`, `ReviewFocusBlock`),
`findings.jsx` (`VerdictBanner` with the provenance tooltip, a regenerate icon, a cost line under the score),
`data.jsx`, the current Overview and Agent runs tabs, the brief catalog, client INSIGHTS. Live system: not checked.

Decisions taken in this spec (from the user's brief):
- Client only: no server read is needed (Module interactions). Spec moved from root `specs/` to `client/specs/`.
- Newest finished run = newest saved review whose run is done (2026-11-08 decision, made precise in AC-2).
- Counts match the Agent runs tab (AC-3). Note: the run timeline's "blockers" counts findings at or above the
  agent's gate, which can differ from the banner. The banner follows the Agent runs tab, as asked.
- Score colours: kit thresholds only (AC-3).

Decisions (user, 2026-11-09 — all proposals accepted as written; the ACs use these options):
1. **Text when a review exists but there is no brief:** the banner shows the verdict and the "No brief yet" +
   Generate in its text area (AC-5). Alternative: show the review's own summary until a brief exists. Not
   chosen, because the user said the banner text is the brief's summary.
2. **Severity label:** keep a visible severity word on each risk card (AC-8, SPEC-06 AC-2/a11y). The
   screenshots show only a coloured icon; the visible word is kept (user decision, 2026-11-09).
3. **Risk expand:** each risk toggles on its own (AC-8). In the design, opening one closes the others and the
   explanation shows in a shared panel under the row. Independent toggles are simpler for keyboard and screen
   reader users.
4. **Clicking the risk card body** opens its first ref, like the design. The chevron only expands.
5. **Regenerate:** the design's refresh icon in the banner is fine if its accessible name stays "Regenerate"
   (AC-5).
6. **Cost line:** the design puts `$0.014 8.2K→1.3K` under the score, where it reads as the review's cost.
   Proposal: keep the brief's meta line (AC-12) in its place and add no cost under the score.
7. **Agent name:** in the info control only (AC-7), not as a badge on the banner (the design has no badge).
8. **Truncated note:** stays a muted line. Only "Missing inputs" becomes a warning note.
9. **Size:** 12 AC. If more is added, split into "PR Brief verdict banner" (AC-1–7) and "PR Brief
   navigation + visuals" (AC-8–12).

States covered: review none / loading / load error / finished (AC-1–4, AC-6); brief none / generating / error
/ outdated / no files / ready, inside the banner (AC-5); risk collapsed / expanded (AC-8); jump to line /
file-level / not rendered / blast-only (AC-9, AC-10); missing inputs (AC-12).

## [NEEDS CLARIFICATION]

None.
