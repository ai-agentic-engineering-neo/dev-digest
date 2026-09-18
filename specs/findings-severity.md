# Spec — findings severity breakdown & findings popover

Status: **implemented, both surfaces.** (2026-09-17: scope and the four semantic decisions in §5
locked with the requester. 2026-09-18: implemented and verified in a browser. Three §9 open
questions resolved during implementation — the `Popover` panel needed a **portal**, not absolute
positioning, because the PR-list table card sets `overflow: hidden`, which §4.1 predicted as the
fallback case. 2026-09-18, after review against real multi-agent data: the "single latest review"
rule was **reverted** — the row now unions each agent's latest review, and `score`/`cost_usd`
changed with it. See §5.)

## 1. What this adds

Two read-only display surfaces, each a **severity breakdown that opens a findings popover on
click**. Both render counts of findings already persisted by a completed review — no new review
logic, no new LLM calls.

1. **PR list — FINDINGS column**, inserted between `SCORE` and `STATUS`.
   `client/src/app/repos/[repoId]/pulls/_components/PRRow` — up to three compact badges
   (e.g. `⊘2  ⚠2  ⚲2`). Clicking opens a popover headed `6 FINDINGS` listing them.
   Scope: **the PR's latest review** — the same review whose `score` already renders in the
   cell to its left.
2. **PR detail Timeline — per-run breakdown.**
   `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory` — the same badges on
   each settled run row, replacing the findings half of today's `N finding(s) · N blockers`
   line (`RunHistory.tsx:192-197`). Clicking opens a popover headed
   `N FINDINGS IN THIS RUN`, scoped to **that one run**.

Scope for #1 is **each agent's latest review for the PR, unioned** — see §5, which records why
the original "single latest review" rule was reverted and what it took with it. #2 needs no
"latest" concept at all: `RunHistory` already renders one row per specific `RunSummary`.

## 2. Why the data isn't already there

Findings are fully modelled, persisted, and already rendered on the PR detail page. Only the
*aggregate* is missing, and one piece of it is already written and tested but wired to nothing:

- `Severity` is a settled uppercase enum, `z.enum(['CRITICAL','WARNING','SUGGESTION'])`
  (`server/src/vendor/shared/contracts/findings.ts:11`). The client copy of that file is
  **byte-identical** today — unlike `trace.ts`/`knowledge.ts`/`adapters.ts`, which have drifted
  (see root `INSIGHTS.md`). It must stay identical.
- `findings` rows carry `severity` (plain `text`, no enum/CHECK) and a nullable `dismissed_at`
  (`server/src/db/schema/reviews.ts:36,45`).
- **`rollupSeverities(rows)` already exists** — pure, unit-tested, returns
  `{ critical, warning, suggestion }` (`server/src/modules/pulls/status.ts:22-31`). It is
  referenced *only* by `server/test/pulls-status.test.ts`; no route calls it. Its own docblock
  (`status.ts:3-11`) says the PR list "shows, per PR: the latest review's SCORE, a FINDINGS
  severity breakdown, and a review STATUS" — i.e. this surface was anticipated and left
  unfinished.
- `PrMeta` has `score` and `cost_usd` but nothing severity-related
  (`contracts/platform.ts:157-176`).
- The client has an unused view model `PrRowView` that **already declares the exact field**:
  `findings: { CRITICAL: number; WARNING: number; SUGGESTION: number }`
  (`client/src/lib/types.ts:38-48`). It is not on the render path (`PRRow` reads `PrMeta`
  directly), but it fixes the intended naming and casing.
- `GET /pulls/:id/reviews` already returns every review with its **full `findings[]`**
  (`ReviewRecord.findings: FindingRecord[]`, `contracts/review-api.ts:23-37`), so every
  popover's *contents* already have an endpoint. Only the counts need plumbing.
- There is **no `Popover`/`Tooltip`/`HoverCard`** in the design system. The app's only tooltips
  today are native `title=` attributes.

Everything below plugs those two gaps. **No schema migration, no change to how reviews run.**

(A parallel `findings_by_severity: { CRITICAL, WARNING, SUGGESTION }` already exists on the L07
multi-agent scaffolding — `AgentStats` in
`server/src/vendor/shared/contracts/observability.ts:111-115`, plus `AgentColumnFinding`,
`MultiAgentRun`. That is lesson scaffolding for a different feature with no implementing route,
and is untouched by this spec — but its **uppercase keys are the naming precedent** this spec
follows.)

## 3. Server changes

### 3.1 Contracts (edit **both** vendored copies — server is the source of truth, mirror to client)

- New shared shape in `server/src/vendor/shared/contracts/findings.ts` (and the client mirror):

  ```ts
  /** Per-severity finding tally. Keys match the `Severity` enum. */
  export const SeverityCounts = z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  });
  export type SeverityCounts = z.infer<typeof SeverityCounts>;
  ```

  Export it from the barrel (`contracts` are re-exported via
  `server/src/vendor/shared/index.ts:17-27`).

  Uppercase keys, to match the `Severity` enum, the existing `AgentStats.findings_by_severity`,
  and the pre-declared `PrRowView.findings`. **All three keys are required** (an unreviewed PR
  sends `null` for the whole object, never a partial one) so the client never needs `?? 0` per
  key.

- `PrMeta` (`contracts/platform.ts:157-176`, both copies): add next to `score`/`cost_usd`,
  in the same nullability style:

  ```ts
  // Per-severity finding tally for the latest review, excluding dismissed
  // findings (list endpoint only; null/absent until reviewed).
  findings: SeverityCounts.nullish(),
  ```

- **`RunSummary` is deliberately NOT changed** — see §3.3.

### 3.2 `GET /repos/:id/pulls` — latest-review severity tally

Extend the existing latest-review query in `server/src/modules/pulls/routes.ts:114-135`. It
currently selects `t.reviews.{prId, score}` plus the joined `agentRuns.costUsd`, orders
newest-first, and keeps the first row per PR in `latestReviewByPr`.

1. Add `id: t.reviews.id` to that select, and carry it into the `latestReviewByPr` value so the
   winning (latest) review id per PR is known.
2. After the loop, one grouped query over exactly those winning ids:

   ```ts
   const reviewIds = [...latestReviewByPr.values()].map((r) => r.id);
   // GROUP BY in SQL rather than fetching rows and calling rollupSeverities():
   // only 3 rows per review come back instead of every finding.
   const sevRows = reviewIds.length
     ? await container.db
         .select({
           reviewId: t.findings.reviewId,
           severity: t.findings.severity,
           n: count(),
         })
         .from(t.findings)
         .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)))
         .groupBy(t.findings.reviewId, t.findings.severity)
       : [];
   ```

3. Fold into a `reviewId → SeverityCounts` map (zero-filled) and emit alongside `score`:

   ```ts
   findings: review ? (sevByReview.get(review.id) ?? ZERO_SEVERITY_COUNTS) : null,
   ```

   A reviewed PR with no surviving findings gets `{CRITICAL:0,WARNING:0,SUGGESTION:0}`;
   a never-reviewed PR gets `null`. The distinction matters — see §5.

4. **Delete the now-false comment** at `routes.ts:116-119`, which states the per-severity
   breakdown "is intentionally not surfaced on the list — findings live on the PR detail page."
   This spec reverses that decision; leaving the comment would mislead the next reader.

`rollupSeverities` (`modules/pulls/status.ts:22-31`) is **not** called on this path — the SQL
`GROUP BY` does the tallying without materializing every finding row. Two options for the
now-still-orphaned helper, to be settled in review (§9): delete it, or re-key it to uppercase
and use it in the zero-fill/mapping step. Either way it must not be left as the only place in
the server using lowercase severity keys while the new contract uses uppercase.

### 3.3 What is deliberately *not* touched

- **`RunSummary` / `listRunsForPull`** (`contracts/trace.ts:97-119`,
  `modules/reviews/repository/run.repo.ts:40-69`). The Timeline's per-run breakdown is derived
  **client-side** from data the PR detail page already fetches (§4.4) — `usePrReviews` returns
  every `ReviewRecord` with its full `findings[]`, matched to a run by `run_id`. Adding a
  `findings_by_severity` column here would mean a second grouped query per page load for
  numbers the client can already compute, and `reviews.run_id` is an **unconstrained uuid with
  no FK** (noted in `run.repo.ts:71-77`), making that join the more fragile of the two options.
  This mirrors `run-cost.md` §3.5, which resolved the same choice the same way.
- `agent_runs.findings_count` (`db/schema/runs.ts:27`) — written once at run completion and
  never decremented. Left exactly as is; see the divergence note in §5.
- `ReviewRecord` / `reviewsForPull` — already returns everything both popovers need.
- The `findings` table schema and every write path (`run-executor.ts:216-235`) — read-only
  feature, no migration.
- `MultiAgentRun` / `AgentColumn` / `AgentStats` — separate later-lesson feature.

### 3.4 Indexes (optional, flagged)

`findings` has **no indexes at all** — not even on `findings.review_id` — and neither do
`reviews` or `agent_runs` (verified across `server/src/db/migrations/*.sql`). The new
`inArray(findings.reviewId, …)` in §3.2 therefore sequential-scans `findings`. Harmless at
course/demo scale and explicitly **not required** by this spec. If added, it is a generated
migration (`cd server && pnpm db:generate && pnpm db:migrate`) — `src/db/migrations/**` is
append-only, never hand-edited.

## 4. Client changes

### 4.1 `Popover` primitive (new) — `client/src/vendor/ui/kit/Popover.tsx`

The design system has no anchored-popup primitive other than `Dropdown` (a menu, not a content
panel). Add one to the `kit` layer, borrowing `Dropdown.tsx:62-112`'s visual treatment
(`var(--bg-elevated)`, `1px solid var(--border-strong)`, `borderRadius: 9`,
`boxShadow: var(--shadow-modal)`, `animation: ddpop .12s ease`) and its
`document.addEventListener("mousedown", …)` outside-click close.

**As built it uses a portal with `position: fixed`, not `Dropdown`'s absolute positioning.**
`pulls/styles.ts`'s `tableCard` sets `overflow: hidden` to clip its rounded corners, so an
absolutely-positioned panel inside a row is cut off — this is the fallback case flagged under
*Clipping* below, and it turned out to be the real one. The portal also makes the
viewport-bottom flip and the viewport-bounded `maxHeight` straightforward. One consequence:
React portals propagate events through the component tree, not the DOM tree, so the panel
itself must `stopPropagation` or a click inside it still reaches the PR row's navigate
handler — `Popover` does this for every consumer.

```ts
type PopoverProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;   // panel content; rendered only while open
  align?: "start" | "end";
  width?: number;
  label: string;               // accessible name for the trigger
};
```

Requirements beyond what `Dropdown` does today:

- **Close on `Escape`**, and return focus to the trigger.
- `role="dialog"`, `aria-modal={false}`, `aria-expanded` on the trigger — it is a content panel,
  not a menu, so `Dropdown`'s menu semantics are wrong here.
- **Render children only while open**, so the lazy fetch in §4.3 doesn't fire for every row.
- **Vertical flip**: open upward when the trigger is within ~`panelHeight` of the viewport
  bottom. The PR list is a long table and the panel is tall (the mockup shows ~3 findings plus a
  header, ~500px); without this, the last rows' popovers open off-screen.
- **Clipping**: the mockup's panel is ~530px wide and visibly overflows its ~118px grid cell and
  its row. Every ancestor between the panel and the page must be free of `overflow: hidden`
  (check `pulls/styles.ts` `row`/`headRow` and the card wrapper in `pulls/page.tsx`). If any
  ancestor must keep clipping, the panel needs a portal instead of absolute positioning — a
  larger change, so verify this *before* building the cell.

Per `client/src/vendor/ui/README.md`: one component per file, re-exported from the layer's
`index.ts` (`kit/index.ts`), **and added to `client/src/components/showcase/Showcase.tsx`** —
`client/src/test/smoke.test.tsx` mounts that gallery, so a missing or broken export fails CI.
Adding through layer + barrel is the sanctioned way to extend the vendored design system; do not
fork it into `src/components`.

### 4.2 `FindingsList` (new, shared read-only panel) — `client/src/components/findings-list/`

Cross-route component (used from both the `pulls/` list tree and the `pulls/[number]/` detail
tree), following the placement of `run-cost-badge`.

```ts
type FindingsListProps = {
  findings: FindingRecord[];
  loading?: boolean;
  heading: string;          // "6 FINDINGS" | "2 FINDINGS IN THIS RUN"
};
```

Row content per the mockups: `SeverityBadge` icon, title, `CategoryTag`, mono `file:line`
(`MonoLink`), `ConfidenceNum`, and a **truncated** rationale (the mockup clips mid-sentence with
an ellipsis). This is the compact read-only shape of
`RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx` — deliberately **not**
`FindingsPanel`/`FindingCard`, which carry accept/dismiss actions, `j`/`k` keyboard nav, a
low-confidence toggle, and expandable markdown. A popover is a glance surface; triage stays on
the Findings tab.

Ordering: **as built**, a colocated `panelFindings` in `findings-list/helpers.ts` — it sorts by
severity and drops dismissed findings so the list matches the count that opened it.
`FindingsPanel/helpers.ts#visibleFindings` was **not** reused: it is colocated to the PR-detail
route (importing across route trees breaks the colocation convention) and it also applies a
confidence filter, which would hide findings this panel has already counted.

Known styling deviation to flag in review: `SeverityBadge` with `compact` renders a **filled
pill** (icon + count on `s.bg`, `Badge.tsx:63-87`). The mockups' trigger has **no fill** — just a
colored icon and an underlined count, the underline signalling clickability. Either extend
`SeverityBadge` with a `plain`/`underline` variant (design-system change, needs the Showcase
entry) or build the trigger from `SEV` tokens directly in `FindingsCell`. The latter is smaller
but duplicates a fourth severity→color map; three already exist (`FindingCard/constants.ts:4-12`,
`FindingsSection.tsx:12-16`, `FindingsPanel/constants.ts:4-9`).

### 4.3 PR list FINDINGS column

New colocated `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/`
(`FindingsCell.tsx` + `index.ts` + `constants.ts`/`helpers.ts` as needed, per the client's
colocation convention).

- **Trigger**: one badge per **non-zero** severity, in CRITICAL → WARNING → SUGGESTION order.
  Zero counts are omitted entirely (the mockup's `#455` row shows only `⚠2 ⚲4`, no critical
  badge). `findings == null` (never reviewed) renders `<span style={s.muted}>—</span>`, the same
  em dash `PRRow` already uses for an unreviewed `score` (`PRRow.tsx:54`) and `RunCostBadge` uses
  for absent cost.
- **Panel**: `<FindingsList heading={t("list.findings.heading", {count})} …>`, fed by
  `usePrReviews(pr.id)` with `enabled: open` — the endpoint already exists and `PrMeta.id` is on
  the row. Take the **newest** `ReviewRecord` (the endpoint returns newest-first) and filter out
  `dismissed_at != null` so the listed rows match the counts.
- **⚠ `stopPropagation` is mandatory.** The entire `PRRow` has a row-level
  `onClick={() => router.push(...)}` (`PRRow.tsx:25`) that navigates to the PR detail page.
  Without `e.stopPropagation()` on the trigger, clicking a badge navigates away instead of
  opening the popover. The panel needs it too, so clicking a finding inside doesn't navigate.
  This is the single easiest thing to get wrong in this feature.

Wiring:

- `client/src/app/repos/[repoId]/pulls/constants.ts`: insert `"findings"` into `COLUMN_KEYS`
  after `"score"` (line 46, before `"status"`), and insert one track into `GRID` (line 27) after
  the 4th (`60px`, the score track) — `"1fr 132px 92px 60px 120px 118px 78px 78px"`. That one
  constant drives both the header row and every data row, so a single edit keeps them aligned.
  The `s.headCell(i === COLUMN_KEYS.length - 1)` right-align-last assumption
  (`pulls/styles.ts:110-112`) is unaffected since the new column isn't last.
- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`: new cell at line 57 —
  after the score cell closes (line 56), before the status cell.
- `client/src/app/repos/[repoId]/pulls/styles.ts`: add `findingsCell` (left-aligned, small gap
  between badges), next to `scoreCell`/`costCell`.
- `client/messages/en/prReview.json`: add `"findings": "Findings"` to `list.columns`
  (between `"score"` and `"status"`, lines 89-97) plus a `list.findings.heading`
  (`"{count} findings"`). Note `client/messages/en/runs.json:104-108` already has a
  `severity.{critical,warning,suggestion}` block — but the PR list and `RunHistory` both read the
  **`prReview`** namespace, so the badge labels belong there; `runs.json`'s block serves the
  later-lesson multi-agent page.

### 4.4 Timeline per-run breakdown

Purely a render change — **no server change** (§3.3) and no new network call.

- `FindingsTab.tsx` already builds a `run_id → RunSummary` map from the `prRuns` it holds
  (`FindingsTab.tsx:66-71`). Invert the same idea: build `run_id → ReviewRecord` from the
  `prReviews` it also already holds, and pass `findingsByRun` down to `RunHistory`. Neither
  `RunHistory` nor the popover fetches anything itself — the established pattern here
  (see `client/INSIGHTS.md`, 2026-09-17, on threading per-run data down from `FindingsTab`
  rather than letting leaf components fetch).
- `RunHistory.tsx:192-197`: today's `settled &&` block renders
  `t("runStatus.findings", {count})` + `t("runStatus.blockers", {count})`. Replace the findings
  half with the `FindingsCell` trigger + popover (heading
  `t("runStatus.findingsInRun", {count})`); **keep the blockers text** — `blockers` is a
  gate-aware server number (`countBlockers` against the agent's `ciFailOn`, `spec review-flow.md`
  S4) and is not derivable from severity counts.
- Counts here exclude dismissed findings too, for consistency with #1.
- A run with no matching review (failed/cancelled, or a review since deleted) renders no badges —
  the block is already gated on `settled`, matching how the cost badge behaves on that row.

## 5. Data semantics

| Decision | Choice | Why |
|---|---|---|
| Scope of the PR-list row | **Each agent's latest review, unioned** | Revised 2026-09-18 — see below. |
| Dismissed findings | **Excluded** everywhere | The badge reflects outstanding work; dismissing a finding visibly decrements it. |
| Clicking one severity badge | **Always shows all findings** | Matches both mockups (`6 FINDINGS` on a 2/2/2 row; `2 FINDINGS IN THIS RUN`). One panel, one code path, no filter state. |
| Popover contents | **Compact, read-only** | Triage (accept/dismiss) stays on the Findings tab; §4.2. |

### The latest-review rule, and why it was reverted

Originally (2026-09-17) the row described **the single newest review**, chosen to match how
`score`/`cost_usd` already worked and to guarantee the count couldn't contradict the score ring.

That was wrong, and shipping it surfaced the bug immediately: **a multi-agent review persists one
`reviews` row per agent, seconds apart**, so "the newest" is whichever agent finished last — a
race. A real PR whose Security Reviewer found 3 issues and General Reviewer 2 rendered as `—`,
because a Performance Reviewer finished 8 seconds later having found none. The Timeline showed all
five findings while the list showed nothing.

The pre-existing `score` ring had **the same defect already** and predated this feature: that PR's
ring read `100`. So the fix covers all three fields (revised 2026-09-18):

- **`findings`** — union of each agent's latest review (an older review *by the same agent* is
  superseded, not added).
- **`score`** — **recomputed** from that union via `scoreFromSeverityCounts`, the engine's own S2
  penalty table. Neither the newest review's stored score nor the worst stored score describes the
  union, so neither can be shown beside these badges. For a single-agent PR this equals the stored
  score, because S1/S2 already derive it the same way.
- **`cost_usd`** — **summed** across those same runs, i.e. what reviewing this PR actually cost.
  Previously one arbitrary agent's run cost, by the same race.

Two consequences of deriving score from the same filtered set:

1. **Dismissal now moves the score.** The earlier spec recorded the opposite as deliberate
   ("dismissing a finding decrements the counts but never recomputes `reviews.score`"). That
   divergence is gone from the list row by construction: badges and ring are two views of one
   number. `reviews.score` itself is still immutable — only the *row's* derived score moves.
2. **A stale-commit caveat.** `reviews` has no `head_sha` column (only
   `pull_requests.last_reviewed_sha`, one value per PR), so "each agent's latest" can include a
   review run against an older commit. There is no way to scope it per review without a schema
   change. Left as-is; the Timeline has the same exposure.

| Situation | `PrMeta.findings` | Cell shows |
|---|---|---|
| Union has findings | `{CRITICAL:2,WARNING:2,SUGGESTION:2}` | `⊘2 ⚠2 ⚲2`, click → `6 FINDINGS` |
| Union, some severities empty | zeros for those keys | only the non-zero badges |
| Union, all findings dismissed | `{0,0,0}` | `—`, and the ring reads 100 (see §9) |
| Reviewed, genuinely zero findings | `{0,0,0}` | `—`, ring 100 |
| PR never reviewed | `null` | `—`, ring `—` |

**The row is internally consistent by construction:** `score = clamp(100 − 35·C − 12·W − 3·S)`
over the very counts on the badges, so a reader can verify the ring from the cell beside it.

**One divergence remains, accepted:** `agent_runs.findings_count` is written once at completion
(`run-executor.ts:244-255`) and never decremented, so after a dismissal the Timeline's severity
badges sum to less than the run's stored `findings_count`. The badges are the live number; the
fallback text uses the frozen one only when the caller has no findings for that run.

## 6. Acceptance criteria

1. A reviewed PR shows one badge per non-zero severity in the FINDINGS column, between SCORE
   and STATUS, with zero-count severities omitted.
2. A row's badge counts and its score ring **always** satisfy
   `score = clamp(100 − 35C − 12W − 3S, 0, 100)`, dismissals included.
2b. A PR reviewed by several agents shows the **union** of their latest reviews: a PR whose
   agents found 2+1 and 1+1 reads `⚠3 ⚲2` with a score of 58 — never `—` because the
   last agent to finish found nothing. An older review by the *same* agent is superseded.
2c. `cost_usd` on that row is the **sum** of the runs behind those reviews, not one of them.
3. A never-reviewed PR shows `—` in the FINDINGS column — the same cell state and same em dash
   as its SCORE and COST cells.
4. Clicking **any** severity badge opens one popover listing **all** of that review's
   non-dismissed findings, headed with the total; clicking a different badge on the same row
   opens the same content.
5. Clicking a badge **does not navigate** to the PR detail page, and neither does clicking
   inside the panel. (§4.3 — regression-test this specifically.)
6. `Escape` and an outside click both close the popover; focus returns to the trigger.
7. A popover on the last visible row opens upward and is fully readable — not clipped by the
   table and not off-screen.
8. The findings endpoint is called **only** when a popover is opened, never once per row on
   list render.
9. Each settled Timeline row shows its **own** run's severity breakdown (a PR with three
   settled runs shows three independent breakdowns), and its `N blockers` text is unchanged.
10. Dismissing a finding on the Findings tab decrements the Timeline badge for its run once the
    reviews query is invalidated.
11. Zero additional LLM calls; no migration applied.
12. Both vendored `shared` copies stay in sync for `findings.ts` and `platform.ts` after this
    change (they are byte-identical before it).

## 7. Out of scope

- Any change to how reviews run, score, or ground findings.
- Accept/dismiss from inside the popover — triage stays on the Findings tab (§4.2).
- Filtering or sorting the PR list by severity, and a severity column on any other surface
  (agents list, trace drawer stats box).
- The L07 multi-agent `AgentStats.findings_by_severity` scaffolding.
- Recomputing `reviews.score` when a finding is dismissed (§5, divergence 1).
- Adding indexes — flagged in §3.4, explicitly not required.

## 8. Test plan

Server:

- `pulls/routes.ts` (DB-backed, so **`*.it.test.ts`** — the suite splits by filename, not
  content; a DB test in the unit lane fails without Docker): `GET /repos/:id/pulls` returns
  correct per-severity counts for a seeded reviewed PR; `null` for a never-reviewed PR; zeros
  for a reviewed PR whose findings are all dismissed; counts come from the **latest** review
  when a PR has two, and exclude dismissed rows.
- `pulls-status.test.ts`: update for whatever §3.2/§9 decides about `rollupSeverities` (delete
  the test with the helper, or re-key it to uppercase).

Client (vitest + jsdom, `fetch` mocked — a component fetching outside `api.ts` escapes the mock
and hangs):

- `Popover`: opens on trigger click, closes on outside click and on `Escape`, renders children
  only while open, flips when near the viewport bottom.
- `FindingsList`: renders rows severity-sorted; shows a loading state; renders an empty state.
- `FindingsCell`: omits zero-count badges; renders `—` for `null`; opens the panel on click;
  **does not** call the row's navigate handler (criterion 5); fires the reviews query only once
  opened (criterion 8).
- `PRRow`: renders the cell from `pr.findings`.
- `RunHistory`: update `RunHistory.test.tsx:47-95`, which asserts the **current**
  `N finding(s) · N blockers` text and will break; add per-run breakdown assertions and confirm
  the blockers text survives.
- `smoke.test.tsx`: passes with `Popover` added to the Showcase.

e2e (`./scripts/e2e.sh` — isolated seeded stack; flows `02`/`04` assume the seeded demo repo is
the *only* repo, so they fail against a dev DB with real imports):

- `02-repo-pulls-detail.flow.json` — the PR list gained a column; check any column-index or
  grid-dependent assertion.
- `04-pr-findings.flow.json` — extend with opening a popover from the list.

## 9. Open questions for review

- ~~**`rollupSeverities`**~~ — **resolved**: replaced by `tallySeverityGroups`, which returns the
  shared uppercase `SeverityCounts` and consumes the SQL `GROUP BY` rows rather than one row per
  finding. The server now has no lowercase severity keying at all, and the helper is wired to a
  route instead of only to its own test.
- ~~**Badge trigger styling**~~ — **resolved**: the trigger is built from the canonical `SEV`
  tokens exported by the `@devdigest/ui` barrel, so it adds **no** fourth severity→colour map and
  leaves the vendored `SeverityBadge` untouched. `SeverityBadge` was not extended.
- ~~**Column width**~~ — **resolved**: `104px`, measured from the rendered badges (~92px for
  three) plus slack. `124px` was tried first and visibly squeezed the `1fr` title column.
- **`{0,0,0}` vs `null`**: still open. Both render `—` today. Should a reviewed-and-clean PR read
  differently from a never-reviewed one — e.g. a muted `0` or a check glyph — given its score
  ring already shows `100` while an unreviewed one shows `—`? The contract keeps the two
  distinguishable, so this is a pure display choice.
- Whether the unused `PrRowView` (`client/src/lib/types.ts:38-48`) should be deleted now that
  `PrMeta` carries the field it was scaffolding for — same question `run-cost.md` §9 left open
  for `cost`.
- **Not in the original spec, added during implementation**: `useFindingAction` now also
  invalidates the `["pulls"]` query, because the PR-list counts are computed server-side and
  exclude dismissed findings — without it, triaging on the detail page left a stale count on the
  list until the 60s refetch. Flagging it as a scope addition rather than burying it.
