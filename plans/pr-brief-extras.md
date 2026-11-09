# Implementation Plan: PR Brief extras — verdict banner, risk expand, exact-line focus, visual parity

- **Status:** in progress
- **Execution mode:** multi-agent  <!-- planner rule: 11 tasks (≥ 6) and W1 has 4 independent tasks; the caller asked the planner to pick by rule -->
- **Goal:** On a PR's Overview the brief's summary sits in a verdict banner showing the newest finished review run (verdict, "N findings · M blockers", PR score, provenance info control); risks are compact cards that expand; a Review focus item or risk ref with a line opens Files changed scrolled to, highlighting and focusing that line (or the file header with a note); the brief uses section labels, severity-coloured risk icons, accent file links and a warning-style "Missing inputs" note.
- **Specs:** `SPEC-07` — client/specs/pr-brief-extras.md (approved; supersedes SPEC-06 AC-2 risk layout and AC-9 click target only).
- **Branch:** `feat/pr-brief` (SPEC-06 implemented, plan `plans/pr-brief.md`). No Smart Diff: Files changed is the flat `DiffViewer` list.
- **Packages:** client only. server · reviewer-core · e2e · mcp: no change.
- **Out of scope:** (spec Non-goals) any change to brief generation, the model call, the cache, the stored brief or the brief API; any server endpoint/field (verified below); skill-inherited spec docs (deferred to a future server spec); an aggregate verdict over several agents; a "reviewed for commit X" marker; any change to the Agent runs tab's banner, counts or score; Smart Diff work, incl. re-applying the line target on `local/all-lessons` (merging is not part of this plan); brief history; running a review from the banner; new colours/tokens; a cost line under the score (spec decision 6). Not planned: editing `*/src/vendor/shared/**`; adding brief components or `VerdictBanner` to `/showcase` (route-local, they call `useTranslations`; the Gallery has no intl provider); changing `e2e/specs/13-pr-brief.flow.json` (nothing it waits for or clicks changes — see T10 / Risks).

## Server check (spec Module interactions — confirmed, no server read needed)

- `GET /pulls/:id/reviews` → `ReviewRecord[]` newest first (`server/src/modules/reviews/repository/review.repo.ts:66` `orderBy(desc(createdAt))`) with `verdict`, `summary`, `score`, `agent_name`, `run_id`, `created_at`, `findings[]` (`severity`, `dismissed_at`) (`client/src/vendor/shared/contracts/review-api.ts:23`). Already loaded by `page.tsx:41` (`usePrReviews`, key `["reviews", prId]`).
- `GET /pulls/:id/runs` → `RunSummary[]` with `status` running|done|failed|cancelled (`contracts/trace.ts:96`). Already loaded by `page.tsx:47` (`usePrRuns`, key `["pr-runs", prId]`).
- The review row is inserted before the run is marked done (`server/src/modules/reviews/run-executor.ts:271` `insertReview` → `:332` `completeAgentRun({ status: 'done' })`), so "newest review whose run is done" is decidable on the client (AC-2).
- Run settling is visible on every tab through `usePrActiveRuns` (polls 4 s while non-empty, `client/src/lib/hooks/reviews.ts:29`); `useRefreshIntentWhenRunsSettle` (`hooks/intent.ts:28`) is the pattern for "refresh on settle, whichever tab". `usePrReviews` itself never polls and the app's `staleTime` is 30 s with `refetchOnWindowFocus: false` (`src/lib/query-client.ts:13-14`), so AC-6 needs one settle hook (T2).

## Global constraints

- Client only. No edits under `server/`, `reviewer-core/`, `e2e/`, `*/src/vendor/shared/**`; no API contract change; no new hook that calls a new endpoint. Banner data = `usePrReviews` + `usePrRuns` (same query keys as the page, so no extra requests).
- No `fetch` in components; every user-visible string from `messages/en/brief.json` (new strings) or the existing `prReview.json` `verdict.*` (verdict labels, chip, "PR SCORE" — reused via `VerdictBanner`). `@devdigest/ui` barrel imports only. Styles = `s` objects over EXISTING CSS vars only: `--accent`, `--accent-hover`, `--accent-text`, `--accent-bg`, `--crit`, `--crit-bg`, `--warn`, `--warn-bg`, `--info`, `--info-bg`, `--ok`, `--border`, `--bg-elevated`, `--bg-hover`, `--text-primary`, `--text-secondary`, `--text-muted` (all in `src/vendor/ui/styles.css`).
- Focus ring: rely on the global `:focus-visible` rule (`src/vendor/ui/styles.css:238`); never set an inline `outline` on links/buttons/toggles.
- Model output (summary, risk titles/explanations, focus reasons, paths) and agent names stay plain text (no Markdown, no `dangerouslySetInnerHTML`). Only grounded refs become links; GitHub hrefs only via `githubBlobUrl`. A line target comes only from the stored `line` / `start_line`–`end_line`; a target line not in the rendered diff is never invented (AC-10).
- Interface changes are additive (optional props, `OpenDiffTarget` adds an OPTIONAL 2nd parameter), so `tsc` stays green at every wave gate. Known interim red tests until their owner task runs (expected — W1/W2 gates run per-task tests + typecheck, the full suite runs at W3): `RiskAreas.test.tsx` / `ReviewFocusList.test.tsx` / `OverviewTab.test.tsx` assertions `onOpenFile` called with the path only (fixed by T9 / T10 / T11); `ReviewFocusList.test.tsx` heading "(3)" (fixed by T10); `ReviewFocusList` rows render the missing key `brief.focus.item` and its row-text assertions fail from W0 (T1 removes the key) until T10 replaces the label (user decision 2026-11-09).
- Client INSIGHTS (package-wide): `- 2026-11-06 — \`@testing-library/user-event\` is NOT a client dependency (only \`@testing-library/react\` + \`jest-dom\`), but the \`react-testing-library\` skill and plans say \`userEvent\` → 4 implementers hit TS2307 in one run; use \`fireEvent\` from \`@testing-library/react\` (as AgentCard/FindingCard tests do), or add the dep deliberately — never import it ad hoc (package.json:28 → devDependencies).`; `- 2026-11-06 — Mock throws "cannot destructure" AFTER a test passed: \`beforeEach(() => post.mockReset())\` returns the mock, Vitest treats a function returned from a hook as cleanup and calls it with no args → always give \`beforeEach\` a block body \`() => { post.mockReset(); }\` (src/lib/hooks/reviews.test.tsx:33 → beforeEach).`; `- 2026-11-06 — CORRECTION of the entry above (no css-vars guard): … \`src/test/css-vars.test.ts\` now exists on main and fails on any \`var(--x)\` not declared in a .css file, so new components are covered automatically (src/test/css-vars.test.ts).`; `- 2026-11-04 — On this Windows box \`pnpm typecheck\`/\`pnpm test\` fail with "Access is denied" (pnpm 12 shim) → run the bins directly: \`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json\`, \`node node_modules/vitest/vitest.mjs run\` (same in server/) (package.json:10 → scripts.typecheck).`; `- 2026-11-09 — A long Bash-tool command creating several component/test files via heredocs fails with "unexpected EOF while looking for matching \`'\`" when the content has \`'\` (JSX attribute strings, test names) and writes NOTHING; it hit implementers in both packages during the PR Brief plan (client T10) → create files with the Write tool, one call per file; Bash only for running commands (Bash tool on Windows; same entry in ../server/INSIGHTS.md).`

## Technical decisions (planner, from code)

| # | Decision | Why |
|---|---|---|
| D1 | Line target lives in the URL: `?tab=diff&file=<path>&line=<start>&lineEnd=<end>`; `setTab` drops `file`, `line`, `lineEnd`. | AC-9 "reloading … SHALL scroll and highlight again" + "stays until the user opens another target or leaves the tab"; tab/file already live in the query (`page.tsx:63-83`). |
| D2 | `OpenDiffTarget = (path, lines?: LineRange \| null) => void` replaces `(path) => void` on the brief components and the page; `lines` absent/null = file-level (header) target. | Optional 2nd parameter keeps every intermediate wave type-correct. |
| D3 | `DiffViewer`/`FileCard` get `focusLines` + a ready-made `focusMissingNote` string; `DiffTab` translates it from the brief catalog. `diff-viewer` stays free of the `brief` namespace. | Spec NFR: new strings from the brief catalog; `src/components/diff-viewer` is shared UI. |
| D4 | Target row = first parsed line with `kind` `add`/`ctx` and `newNo === start`; highlighted rows = every `add`/`ctx` row with `start ≤ newNo ≤ end`. Not found (outside hunks, removed-only, no patch) → AC-10 fallback. | AC-9 "new-side line … added or unchanged"; AC-10. |
| D5 | Newest finished review: walk reviews by `created_at` desc; `run_id === null` → finished; else the run with that id in the loaded run list must have `status === "done"`; a run id not (yet) in the run list counts as not finished (cache race after a settle — the next run-list refetch shows it). A review with `verdict === null` is skipped (the executor always writes a verdict: `Review.verdict` is required in `contracts/findings.ts:67`; only legacy rows can be null). | AC-2; `VerdictBanner` needs a verdict. |
| D6 | Verdict state: either query `isError` → `error` (note + Retry, SPEC-06 look); either query still without data → `none` (SPEC-06 look, no flicker note); else `ready` when D5 finds a review, otherwise `none`. | AC-4; spec "States covered: review none / loading / load error / finished". |
| D7 | AC-6 refresh = `useRefreshReviewsWhenRunsSettle(prId, reviewRunning)` called in `page.tsx` next to `useRefreshIntentWhenRunsSettle`: on running → settled it invalidates `["reviews", prId]` and `["pr-runs", prId]`. Deletes already invalidate those keys (`useDeleteRun`, `useDeleteReview`). No idle polling is added. | Spec Module interactions ("run history is already polled while a run is active, which is enough"); CLAUDE.md "Don't add a third mechanism"; NFR "no server request beyond the review and run lists". |
| D8 | Counts come from ONE route helper `reviewCounts(findings)` used by both `ReviewRunAccordion` (Agent runs tab, behaviour unchanged) and the Overview banner. | AC-3 "Both counts SHALL equal what the Agent runs tab's banner shows" — equal by construction. |
| D9 | `VerdictBanner` gets optional `titleAside`, `body`, `stackOnNarrow`; with none of them its output is unchanged. The Overview passes `summary={null}` and `agentName={null}` (no review summary, no agent badge — spec decision 7, Untrusted inputs). | Spec "its banner is reused as is; its behaviour does not change"; edge case "Narrow window: … stack and do not overlap". |
| D10 | Section headings use a new route-local `BriefSectionLabel` (`<h3>` with icon + uppercase text styled with the kit `SectionLabel`'s values, optional count `Badge`), not the kit `SectionLabel` (a `div` with no heading role). Icons: PR Brief `Sparkles`, Risk areas `AlertTriangle`, Review focus `ListChecks`. | AC-11 look + heading semantics the existing tests and screen readers use. |
| D11 | Info control = `<button type="button">` whose `aria-label` is the provenance text + a `role="tooltip"` bubble shown on hover (150 ms close delay) and on focus; blur / Escape close. | AC-7; client INSIGHTS 2026-11-05 hover-popover entry. |
| D12 | Risk card body click (outside its buttons/links) opens its first ref the same way the ref does: in-diff → `onOpenFile`, blast-only with repo + sha → `window.open(href, "_blank", "noopener,noreferrer")`, else nothing; the chevron only expands. | Spec decision 4. |
| D13 | `brief.json`: `focus.title` loses "({count})"; the old `focus.item` key is REMOVED by T1 (user decision 2026-11-09); T10 must not use it. | AC-11 badge; one owner per messages file (T1). |

## Contracts (Wave 0)

```ts
// ---------- client/src/components/diff-viewer/focus.ts (T1) — re-exported (types) from diff-viewer/index.ts ----------
/** Inclusive new-side line range of a deep-link target: start ≥ 1, end ≥ start (one line: end === start). */
export interface LineRange { start: number; end: number }
/** Opens a changed file in Files changed. `lines` null/absent = file-level target (header only, SPEC-06 AC-9). */
export type OpenDiffTarget = (path: string, lines?: LineRange | null) => void;

// ---------- …/[number]/constants.ts (T1) ----------
export const DIFF_FOCUS_PARAM = { tab: "tab", file: "file", line: "line", lineEnd: "lineEnd" } as const;

// ---------- …/[number]/helpers.ts (T1) — pure ----------
/** findings = all stored findings (dismissed included); blockers = CRITICAL with dismissed_at === null. */
export function reviewCounts(findings: readonly Pick<FindingRecord, "severity" | "dismissed_at">[]): { findings: number; blockers: number };
/** Query string with tab=diff, file=path and line/lineEnd set (deleted when lines is null); other params kept. */
export function withDiffFocus(search: string, path: string, lines: LineRange | null): string;
/** Query string with tab set and file/line/lineEnd deleted; other params kept. */
export function withTab(search: string, tab: string): string;
/** line must match /^[1-9]\d*$/ (else lines null); lineEnd missing/invalid/< line → end = start; no file → lines null. */
export function diffFocusFrom(search: { get(name: string): string | null }): { path: string | null; lines: LineRange | null };

// ---------- client/src/lib/hooks/reviews.ts (T2) ----------
/** reviewRunning true → false: invalidate ["reviews", prId] and ["pr-runs", prId]. Mirrors useRefreshIntentWhenRunsSettle. */
export function useRefreshReviewsWhenRunsSettle(prId: string | null | undefined, reviewRunning: boolean): void;

// ---------- …/OverviewTab/_components/PrBriefCard/types.ts (T8) — `export type { BriefVerdict }` from PrBriefCard/index.ts ----------
import type { Verdict } from "@devdigest/shared";
export type BriefVerdict =
  | { state: "none" }   // no finished review run, or review/run data still loading → SPEC-06 look (AC-4)
  | { state: "error" }  // review or run data failed to load → SPEC-06 look + "Review verdict unavailable" + Retry (AC-4)
  | { state: "ready"; verdict: Verdict; score: number | null; findings: number; blockers: number; agentName: string | null; reviewedAt: string };

// ---------- …/OverviewTab/helpers.ts (T11) — pure ----------
export function newestFinishedReview(reviews: readonly ReviewRecord[], runs: readonly RunSummary[]): ReviewRecord | null; // D5
export function toBriefVerdict(input: { reviews: ReviewRecord[] | undefined; runs: RunSummary[] | undefined; failed: boolean }): BriefVerdict; // D6 + reviewCounts

// ---------- component props (owner task) ----------
// BriefSectionLabel({ icon: IconName; id?: string; count?: number; children: ReactNode })                         T3
// DiffViewer({ files, commenting?, focusPath?, focusLines?: LineRange | null, focusMissingNote?: string | null })    T4
// FileCard({ file, commenting?, focused?, focusLines?: LineRange | null, focusMissingNote?: string | null })          T4
// CodeLine({ ln, path, threads, commenting?, highlighted?: boolean, rowRef?: React.Ref<HTMLDivElement> })            T4
// DiffTab({ prId, filesCount, files, canComment?, focusPath?, focusLines?: LineRange | null })                      T4
// VerdictBanner({ …existing, titleAside?: ReactNode, body?: ReactNode, stackOnNarrow?: boolean })                     T5
// BriefFileLink({ path, line: number | null, endLine?: number | null, inDiff, repoFullName, linkSha,
//                 onOpenFile: OpenDiffTarget, label: string, reason?: string })                                       T6
// briefRefHref(path: string, line: number | null, repoFullName: string | null, linkSha: string | null): string | null  T6 (exported from BriefFileLink/index.ts)
// VerdictProvenance({ agentName: string | null; reviewedAt: string })                                                 T7
// PrBriefCard({ …existing, verdict?: BriefVerdict /* default { state: "none" } */, onRetryVerdict?: () => void })   T8
// RiskAreas / ReviewFocusList({ …existing, onOpenFile: OpenDiffTarget })                                              T9 / T10
// OverviewTab({ …existing, onOpenFile: OpenDiffTarget })                                                              T11
```

**`messages/en/brief.json` (T1)** — keep every existing key; CHANGE `focus.title` → "Review focus — read these first"; ADD:
`link.withReason` "<loc>{location}</loc> — {reason}" (rich: tag `loc` ≠ values `location`/`reason`),
`risk.moreRefs` "+{count} more", `risk.expand` "Show details: {title}", `risk.collapse` "Hide details: {title}",
`verdict.unavailable` "Review verdict unavailable", `verdict.retry` "Retry loading the review verdict",
`verdict.provenance` "Verdict, findings and score come from {agent}'s review run of {when}. Summary, risks and review focus come from the brief.",
`verdict.unknownAgent` "an agent",
`diffTarget.lineNotInDiff` "Line {line} isn't part of this diff — showing the file".

## File ownership map

`…` = `client/src/app/repos/[repoId]/pulls/[number]`.

| File | Task | New / Modified |
|---|---|---|
| `client/src/components/diff-viewer/focus.ts` | T1 | new |
| `client/src/components/diff-viewer/index.ts` | T1 | modified |
| `client/messages/en/brief.json` | T1 | modified |
| `…/constants.ts` | T1 | new |
| `…/helpers.ts` | T1 | new |
| `…/helpers.test.ts` | T1 | new |
| `client/src/lib/hooks/reviews.ts` | T2 | modified |
| `client/src/lib/hooks/reviews.test.tsx` | T2 | modified |
| `…/_components/OverviewTab/_components/BriefSectionLabel/BriefSectionLabel.tsx` | T3 | new |
| `…/_components/OverviewTab/_components/BriefSectionLabel/index.ts` | T3 | new |
| `…/_components/OverviewTab/_components/BriefSectionLabel/styles.ts` | T3 | new |
| `…/_components/OverviewTab/_components/BriefSectionLabel/BriefSectionLabel.test.tsx` | T3 | new |
| `client/src/components/diff-viewer/helpers.ts` | T4 | modified |
| `client/src/components/diff-viewer/styles.ts` | T4 | modified |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | T4 | modified |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | T4 | modified |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | T4 | modified |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` | T4 | modified |
| `…/_components/DiffTab/DiffTab.tsx` | T4 | modified |
| `…/_components/DiffTab/DiffTab.test.tsx` | T4 | new |
| `…/_components/VerdictBanner/VerdictBanner.tsx` | T5 | modified |
| `…/_components/VerdictBanner/styles.ts` | T5 | modified |
| `…/_components/VerdictBanner/VerdictBanner.test.tsx` | T5 | modified |
| `…/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | T5 | modified |
| `…/_components/ReviewRunAccordion/ReviewRunAccordion.test.tsx` | T5 | new |
| `…/_components/OverviewTab/_components/BriefFileLink/BriefFileLink.tsx` | T6 | modified |
| `…/_components/OverviewTab/_components/BriefFileLink/styles.ts` | T6 | modified |
| `…/_components/OverviewTab/_components/BriefFileLink/helpers.ts` | T6 | modified |
| `…/_components/OverviewTab/_components/BriefFileLink/helpers.test.ts` | T6 | modified |
| `…/_components/OverviewTab/_components/BriefFileLink/index.ts` | T6 | modified |
| `…/_components/OverviewTab/_components/BriefFileLink/BriefFileLink.test.tsx` | T6 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/VerdictProvenance/VerdictProvenance.tsx` | T7 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/VerdictProvenance/index.ts` | T7 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/VerdictProvenance/styles.ts` | T7 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/VerdictProvenance/VerdictProvenance.test.tsx` | T7 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefNotes/BriefNotes.tsx` | T7 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefNotes/styles.ts` | T7 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefNotes/BriefNotes.test.tsx` | T7 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/PrBriefCard.tsx` | T8 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/styles.ts` | T8 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/types.ts` | T8 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/index.ts` | T8 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/PrBriefCard.test.tsx` | T8 | modified |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefBody/BriefBody.tsx` | T8 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefBody/index.ts` | T8 | new |
| `…/_components/OverviewTab/_components/PrBriefCard/_components/BriefBody/styles.ts` | T8 | new |
| `…/_components/OverviewTab/_components/RiskAreas/RiskAreas.tsx` | T9 | modified |
| `…/_components/OverviewTab/_components/RiskAreas/styles.ts` | T9 | modified |
| `…/_components/OverviewTab/_components/RiskAreas/constants.ts` | T9 | modified |
| `…/_components/OverviewTab/_components/RiskAreas/RiskAreas.test.tsx` | T9 | modified |
| `…/_components/OverviewTab/_components/RiskAreas/_components/RiskCard/RiskCard.tsx` | T9 | new |
| `…/_components/OverviewTab/_components/RiskAreas/_components/RiskCard/index.ts` | T9 | new |
| `…/_components/OverviewTab/_components/RiskAreas/_components/RiskCard/styles.ts` | T9 | new |
| `…/_components/OverviewTab/_components/ReviewFocusList/ReviewFocusList.tsx` | T10 | modified |
| `…/_components/OverviewTab/_components/ReviewFocusList/styles.ts` | T10 | modified |
| `…/_components/OverviewTab/_components/ReviewFocusList/ReviewFocusList.test.tsx` | T10 | modified |
| `…/_components/OverviewTab/OverviewTab.tsx` | T11 | modified |
| `…/_components/OverviewTab/helpers.ts` | T11 | new |
| `…/_components/OverviewTab/helpers.test.ts` | T11 | new |
| `…/_components/OverviewTab/OverviewTab.test.tsx` | T11 | modified |
| `…/page.tsx` | T11 | modified |

## Tasks

### T1 [W0] [frontend] Contracts: diff-target types, route URL/count helpers, all new `brief` strings
- **Status:** done
- **Files (only these):** `client/src/components/diff-viewer/focus.ts`, `client/src/components/diff-viewer/index.ts`, `client/messages/en/brief.json`, `…/constants.ts`, `…/helpers.ts`, `…/helpers.test.ts`
- **Depends on:** —
- **Covers:** SPEC-07/AC-3 (`reviewCounts`: dismissed counted in findings, not in blockers), SPEC-07/AC-9 (URL round-trip so a reload re-targets the same line)
- **Produces:** everything in Contracts for these files, exactly as written; `diff-viewer/index.ts` adds `export type { LineRange, OpenDiffTarget } from "./focus";`; the `brief.json` changes listed under Contracts, plus removing the unused `focus.item` key (user decision 2026-11-09; only `ReviewFocusList` uses it, and T10 replaces that label).
- **Insights:** `- 2026-11-05 — \`messages/en/prReview.json\` repeats key names across namespaces (\`filesCount\` in \`smartDiff\` AND \`list\`; \`findings\` in \`runStatus\`, \`list.columns\`, \`list\`), so a text edit anchored on a key (first match) put a block into \`smartDiff\` and the test failed with \`MISSING_MESSAGE prReview.list.findings.chip\` → anchor on the namespace's unique neighbour key and verify with \`node -e "console.log(require('./messages/en/prReview.json').list.findings)"\` (messages/en/prReview.json:61, :107 → filesCount).` (applies to `brief.json`: `title`, `retry`, `failed` repeat across namespaces); `- 2026-11-05 — next-intl \`t.rich\`: a tag name must not equal a value name (\`<repo>{repo}</repo>\` collides) — use \`<r>{repo}</r>\` (messages/en/conventions.json → modal.banner).`; `- 2026-11-08 — \`messages/en/brief.json\` was pre-written for the full product: \`unavailableHint\` says "Run a review or open the PR to compute it", which is wrong for click-only PR Brief generation (same trap as the multi-agent \`runs.json\` copy) → check pre-existing catalog strings against the spec before reusing them (messages/en/brief.json:12 → unavailableHint).`; `- 2026-11-08 — The Bash tool on this Windows box collapses backslash escapes even inside quoted heredocs / \`node -e\` … → edit message JSON / TS with backslashes via the Edit/Write tools, then check with \`node -e "console.log(JSON.stringify(require('./messages/en/shell.json').removeRepo.confirm))"\` (messages/en/shell.json → removeRepo.confirm).`
- **Skill focus:** typescript — `LineRange` / `OpenDiffTarget` exact, no `any`; frontend-ui-architecture — URL/count rules are pure functions in the route `helpers.ts`, param names in `constants.ts`; next — the URL is the only source of the line target.
- **Steps:** `focus.ts` + index export → `constants.ts` → `helpers.ts` → `helpers.test.ts` → `brief.json` (Edit tool, anchored on unique neighbours).
- **Acceptance criteria:**
  - [ ] AC-3: `reviewCounts` of [CRITICAL open, CRITICAL dismissed, WARNING open] → `{ findings: 3, blockers: 1 }`; `[]` → `{ findings: 0, blockers: 0 }`.
  - [ ] AC-9: `diffFocusFrom(new URLSearchParams(withDiffFocus("tab=overview&trace=r1", "src/a.ts", { start: 38, end: 50 })))` → `{ path: "src/a.ts", lines: { start: 38, end: 50 } }` and `trace=r1` is kept; with `lines: null` the result has no `line`/`lineEnd` params; `withTab("tab=diff&file=x&line=3&lineEnd=4", "overview")` contains only `tab=overview`.
  - [ ] `diffFocusFrom` → `lines: null` for `line=0`, `line=-3`, `line=abc`, or a line without `file`; `lineEnd=2` with `line=5` → `{ start: 5, end: 5 }`.
  - [ ] `node -e "const m=require('./messages/en/brief.json');console.log(m.focus.title,'|',m.link.withReason,'|',m.verdict.provenance,'|',m.diffTarget.lineNotInDiff,'|',m.risk.moreRefs)"` prints the new strings; JSON valid; `m.focus.item` is `undefined`; no other key changed.
  - [ ] Searching `client/src` for `focus.item` finds only `ReviewFocusList.tsx` (removed there by T10) — no other user of the key.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run "src/app/repos/[repoId]/pulls/[number]/helpers.test.ts"` → all pass

### T2 [W0] [frontend] `useRefreshReviewsWhenRunsSettle`
- **Status:** done
- **Files (only these):** `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/reviews.test.tsx`
- **Depends on:** —
- **Covers:** SPEC-07/AC-6 (a finished run reaches the review/run caches within 10 s, with no model call)
- **Produces:** `useRefreshReviewsWhenRunsSettle` per Contracts — a `useRef` of the previous `reviewRunning`, effect on `[prId, reviewRunning, qc]` (same shape as `hooks/intent.ts:28`); query keys exactly `["reviews", prId]` and `["pr-runs", prId]`. Nothing else in `reviews.ts` changes.
- **Insights:** `- 2026-11-08 — To test real React Query polling / timeouts in a component, mocking the hook module … can only assert mock arguments … → \`vi.mock("@/lib/api", importOriginal)\` overriding \`api.get/post\` with a mutable fake server so the REAL hooks run, \`QueryClient({ defaultOptions: { queries: { retry: false } } })\`, \`vi.useFakeTimers({ shouldAdvanceTime: true })\` and \`await act(() => vi.advanceTimersByTimeAsync(ms))\` to fire polls/timeouts; assert what the user sees (…/BlastRadiusPanel/BlastRadiusPanel.test.tsx:59 → vi.mock("@/lib/api"), :173 → useFakeTimers).` (the existing mock in `reviews.test.tsx:9` has only `post` — add `get: vi.fn()` to it); `- 2026-11-04 — SSE uses \`new EventSource(API_BASE + '/runs/:id/events')\` in \`hooks/reviews.ts\` — the one sanctioned bypass of \`api.ts\` (fetch wrapper can't stream SSE) (src/lib/hooks/reviews.ts:181 → new EventSource).` (don't touch it; no new mechanism).
- **Skill focus:** react — the effect syncs with the query cache only on the running→settled edge, no state copies; react-testing-library — `renderHook` over the real `usePrActiveRuns` + `usePrReviews`.
- **Steps:** hook → test: `renderHook` of a tiny harness `() => { const a = usePrActiveRuns(id); useRefreshReviewsWhenRunsSettle(id, (a.data?.length ?? 0) > 0); usePrReviews(id); usePrRuns(id); }` over a fake `api.get` whose `/runs/active` answer flips from one run to `[]`.
- **Acceptance criteria:**
  - [ ] AC-6: with fake timers, after the active-runs answer becomes `[]`, `GET /pulls/:id/reviews` and `GET /pulls/:id/runs` are each requested again within `advanceTimersByTimeAsync(10_000)`; `api.post` is never called.
  - [ ] no refetch while `reviewRunning` stays false from the start (no extra requests on mount).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/lib/hooks/reviews.test.tsx` → all pass

### T3 [W0] [frontend] `BriefSectionLabel`
- **Status:** done
- **Files (only these):** `…/_components/OverviewTab/_components/BriefSectionLabel/{BriefSectionLabel.tsx,index.ts,styles.ts,BriefSectionLabel.test.tsx}`
- **Depends on:** —
- **Covers:** SPEC-07/AC-11 (icon + uppercase label like the Intent / Blast radius labels; count in a badge)
- **Produces:** `BriefSectionLabel({ icon, id, count, children })` — `<h3 id={id}>` laid out like kit `SectionLabel` (`src/vendor/ui/primitives/SectionLabel.tsx`: icon 14 px `var(--text-muted)` `aria-hidden`, gap 10, text 12 px / 700 / `letterSpacing: "0.07em"` / `uppercase` / `var(--text-muted)`, `marginBottom: 14`, `margin: 0` otherwise); `count` defined → a kit `Badge` with the number after the text. No `useTranslations` (takes children).
- **Insights:** `- 2026-11-04 — \`Gallery\` (\`src/components/showcase/Showcase.tsx\`) is rendered by \`src/test/smoke.test.tsx\` with NO \`NextIntlClientProvider\` → components added to \`/showcase\` must not call \`useTranslations\`; take translated strings as props (src/test/smoke.test.tsx:4 → Gallery; example: src/components/run-cost-badge/RunCostBadge.tsx:21 → RunCostBadge \`tokenUnit\`).` (route-local: not added to `/showcase`).
- **Skill focus:** frontend-ui-architecture — lives in `OverviewTab/_components/` because three siblings use it, imported only via `index.ts`; react-testing-library — `getByRole("heading", { name })`.
- **Steps:** component + styles + index → test.
- **Acceptance criteria:**
  - [ ] AC-11: renders a heading named by its text with `textTransform: uppercase`, an `aria-hidden` icon before the text, and with `count={3}` a badge "3" inside the heading and no "(3)" text.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run BriefSectionLabel src/test/css-vars.test.ts` → all pass

### T4 [W1] [frontend] Files changed: exact-line target, highlight, focus, fallback note
- **Status:** done
- **Files (only these):** `client/src/components/diff-viewer/{helpers.ts,styles.ts}`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`, `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `client/src/components/diff-viewer/DiffViewer/{DiffViewer.tsx,DiffViewer.test.tsx}`, `…/_components/DiffTab/{DiffTab.tsx,DiffTab.test.tsx}`
- **Depends on:** T1
- **Covers:** SPEC-07/AC-9 (scroll, highlight range, keyboard focus on the target line; re-targets on mount = reload), SPEC-07/AC-10 (no line → header as SPEC-06; line not rendered → header + focus + announced note, no highlight)
- **Produces:**
  - `helpers.ts`: `findLineTarget(lines: Line[], range: LineRange): { targetIndex: number; highlighted: ReadonlySet<number> } | null` per D4 (null when no `add`/`ctx` row has `newNo === range.start`).
  - `CodeLine`: optional `highlighted` → row style adds `background: var(--accent-bg)` + `boxShadow: inset 3px 0 0 var(--accent)` and `data-highlighted="true"`; optional `rowRef` → attached to the row wrapper with `tabIndex={-1}`.
  - `FileCard`: optional `focusLines`, `focusMissingNote`; header gets `ref` + `tabIndex={-1}`. When `focused`: open (existing); once open, for each new target (`${start}-${end}`, tracked in a ref so collapsing/re-opening doesn't re-scroll): target found → `rowRef.scrollIntoView({ block: "center" })` + `focus()`, rows in `highlighted` get `highlighted`; `focusLines` given but not found (incl. no patch) → header `scrollIntoView({ block: "start" })` + `focus()` + `<div role="status">{focusMissingNote}</div>` under the header, no highlight; no `focusLines` → today's behaviour exactly (header scroll only). Non-focused cards ignore `focusLines`.
  - `DiffViewer`: passes `focusLines` / `focusMissingNote` to the focused card only. `DiffTab`: `focusLines` prop; `focusMissingNote = focusLines ? t("diffTarget.lineNotInDiff", { line: focusLines.start }) : null` with `useTranslations("brief")`.
- **Insights:** `- 2026-11-09 — \`FileCard\` exists in two shapes: on main-based branches it owns its \`open\` state (PR Brief added \`focused\` → open + \`scrollIntoView\`), while Smart Diff (\`feat/smart-diff-l03\`, merged only into \`local/all-lessons\`) makes expansion CONTROLLED (\`open\`/\`onToggle\` from \`SmartDiffGroup\`), adds \`findings\` and a \`<button>\` header → merging the two conflicts in DiffTab/DiffViewer/FileCard; resolved in \`local/all-lessons\` 65fabec by keeping both … Re-apply this when Smart Diff returns to main (src/components/diff-viewer/FileCard/FileCard.tsx → FileCard focus effect).` (keep the new logic inside one effect + one helper so it can be re-applied there; merging is out of scope); `- 2026-11-08 — Smart Diff … is NOT on \`main\` nor on branches cut from it … treat roles as missing …`; jsdom has no `scrollIntoView` → stub `Element.prototype.scrollIntoView = vi.fn()` (existing `DiffViewer.test.tsx:9`); `- 2026-11-08 — A focus ring showed after a MOUSE click on the full-width blast symbol row … if rings after clicks show up elsewhere, find the real trigger (re-render? programmatic focus?) before copying the workaround (…/BlastRadiusPanel/helpers.ts:23 → preventMouseFocus).` (programmatic `focus()` here is intended; don't add `preventMouseFocus`).
- **Skill focus:** react — the scroll/focus effect syncs with the DOM only, highlight set derived in render via `findLineTarget` (no state copy); frontend-ui-architecture — `diff-viewer` gets a ready string, never the `brief` namespace (D3); react-testing-library — assert visible rows, `toHaveFocus()`, `role="status"`.
- **Steps:** `findLineTarget` → styles → CodeLine → FileCard → DiffViewer → DiffTab → extend `DiffViewer.test.tsx` (keep its 3 tests) → `DiffTab.test.tsx` (`vi.mock("@/lib/hooks/reviews")` for `usePrComments` / `useCreatePrComment`, provider with `shell` + `brief` messages).
- **Acceptance criteria:**
  - [ ] AC-9: a large file (> `AUTO_EXPAND_MAX_LINES`) with patch `@@ -10,3 +10,4 @@` (ctx 10, del, add 11, add 12, ctx 13) and `focusLines {11,12}` → mounts open, rows 11 and 12 have `data-highlighted="true"`, row 10/13 don't, `scrollIntoView` was called on row 11 and row 11 `toHaveFocus()`; `{12,12}` → only row 12 highlighted and focused.
  - [ ] AC-9: rerender with a new target in the same file (no remount) re-scrolls and moves the highlight; mounting fresh with the same props (= reload) highlights again.
  - [ ] AC-10: target 40 outside every hunk, a removed-only line number, and a file with `patch: null` → header scrolled into view and focused, `role="status"` shows the given note, no `data-highlighted` row.
  - [ ] AC-10: `focusPath` without `focusLines` → the three existing tests stay green (header scroll only, no note).
  - [ ] DiffTab: `focusPath` + `focusLines {start: 40}` on a file without line 40 → "Line 40 isn't part of this diff — showing the file".
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/components/diff-viewer DiffTab src/test/smoke.test.tsx src/test/css-vars.test.ts` → all pass

### T5 [W1] [frontend] `VerdictBanner` slots + shared counts on the Agent runs tab
- **Status:** done
- **Files (only these):** `…/_components/VerdictBanner/{VerdictBanner.tsx,styles.ts,VerdictBanner.test.tsx}`, `…/_components/ReviewRunAccordion/{ReviewRunAccordion.tsx,ReviewRunAccordion.test.tsx}`
- **Depends on:** T1
- **Covers:** SPEC-07/AC-1 (verdict icon + label in the verdict colour, chip, score circle + "PR SCORE"), SPEC-07/AC-3 (same counts as the Agent runs tab; kit score thresholds; no score → no circle/label)
- **Produces:** `VerdictBanner` optional props per D9: `titleAside` rendered at the end of the title row; `body` rendered in the main column instead of the summary paragraph; `stackOnNarrow` → `wrap` gets `flexWrap: "wrap"`, the main column `flex: "1 1 320px"`, so the score column drops below the text on narrow widths. Without them the DOM and styles are unchanged. `ReviewRunAccordion`: `blockers` / findings count from `reviewCounts(review.findings)` (`…/helpers.ts`, imported relatively); nothing else changes.
- **Insights:** `- 2026-11-06 — RESOLVED (2026-11-06 CircularScore entry): user decided the kit wins — tab score "ok" now starts at 75 like \`CircularScore\`, spec + plan updated, \`TabsView.test.tsx\` asserts 72 → \`var(--warn)\` → keep any new score coloring on the kit's 75/50 thresholds, don't introduce a second scale (src/app/repos/[repoId]/multi-agent/constants.ts:10 → SCORE_OK).`; `- 2026-11-04 — \`Gallery\` … rendered with NO \`NextIntlClientProvider\` → components added to \`/showcase\` must not call \`useTranslations\` …` (`VerdictBanner` calls it — not added to `/showcase`).
- **Skill focus:** react — slots via composition (`ReactNode` props), no new branching for existing callers; react-testing-library — one flow per test.
- **Steps:** styles → VerdictBanner → ReviewRunAccordion → tests (`ReviewRunAccordion.test.tsx`: `vi.mock` of `useDeleteReview` from the reviews hooks module, `prReview` messages).
- **Acceptance criteria:**
  - [ ] AC-1/AC-3: `VerdictBanner` with `request_changes`, `findingsCount 6`, `blockers 2`, `score 61`, `body={<p>brief text</p>}`, `titleAside={<button>i</button>}` shows "Request changes", "6 findings · 2 blockers", "61", "PR SCORE", "brief text", the aside button, and no review summary; the score ring stroke is `var(--warn)` (kit 75/50); `score null` → no "PR SCORE"; `blockers 0` → chip "0 findings" without a blocker part.
  - [ ] the existing `VerdictBanner.test.tsx` smoke test passes unchanged (no-slot output unchanged).
  - [ ] AC-3: `ReviewRunAccordion` for a review with 3 findings (1 CRITICAL open, 1 CRITICAL dismissed, 1 WARNING) shows "3 findings · 1 blocker" in its header and "3 findings · 1 blockers" in its open banner (today's strings).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run VerdictBanner ReviewRunAccordion src/test/css-vars.test.ts` → all pass

### T6 [W1] [frontend] `BriefFileLink`: line/range target, accent styling, href helper
- **Status:** done
- **Files (only these):** `…/_components/OverviewTab/_components/BriefFileLink/{BriefFileLink.tsx,styles.ts,helpers.ts,helpers.test.ts,index.ts,BriefFileLink.test.tsx}`
- **Depends on:** T1
- **Covers:** SPEC-07/AC-9 (an in-diff ref with a line/range calls `onOpenFile(path, range)`), SPEC-07/AC-10 (no line → `onOpenFile(path, null)`; blast-only refs keep opening GitHub), SPEC-07/AC-12 (clickable refs mono + accent + hover; non-openable refs muted)
- **Produces:** props per Contracts. In-diff → `<button type="button" className="mono">` calling `onOpenFile(path, line == null ? null : { start: line, end: endLine ?? line })`; blast-only with an href from `briefRefHref` → `<a target="_blank" rel="noopener noreferrer">`; otherwise `<span>`. Visible content: `reason` absent → the mono `label` (path shortened as today); `reason` present → `t.rich("link.withReason", { location: shownLabel, reason, loc: (c) => <span className="mono">{c}</span> })`, all inside the one interactive element. Styles: button/link `color: var(--accent-text)`, hover (local `hovered` state via `onMouseEnter/Leave`, as kit `MonoLink`) → `color: var(--accent-hover)` + underline; the reason part `var(--text-secondary)`; span → `var(--text-muted)`; no inline `outline`. `aria-label`, `title` unchanged. `helpers.ts` adds `briefRefHref` (= `githubBlobUrl(repo, sha, path, line ?? undefined)` when both repo and sha are set, else `null`); `index.ts` also exports `briefRefHref`.
- **Insights:** `- 2026-11-08 — A focus ring showed after a MOUSE click on the full-width blast symbol row, although the only global ring rule is \`:focus-visible\` (src/vendor/ui/styles.css:238) … if rings after clicks show up elsewhere, find the real trigger (re-render? programmatic focus?) before copying the workaround (…/BlastRadiusPanel/helpers.ts:23 → preventMouseFocus).`; `- 2026-11-05 — next-intl \`t.rich\`: a tag name must not equal a value name … use \`<r>{repo}</r>\` (messages/en/conventions.json → modal.banner).`
- **Skill focus:** security — `href` only from `githubBlobUrl` over a grounded path, `rel="noopener noreferrer"`, model text plain; frontend-ui-architecture — siblings import only `index.ts` (`BriefFileLink`, `fileLocation`, `briefRefHref`); react — hover is local UI state.
- **Steps:** helpers (+ test) → styles → component → index → `BriefFileLink.test.tsx` (`brief.json` provider).
- **Acceptance criteria:**
  - [ ] AC-9: in-diff `src/a.ts`, `line 38`, `endLine 50` → click calls `onOpenFile("src/a.ts", { start: 38, end: 50 })`; `line 40` without `endLine` → `{ start: 40, end: 40 }`.
  - [ ] AC-10: `line null` → `onOpenFile("src/a.ts", null)`; blast-only with repo + sha → link `href = githubBlobUrl("acme/app", "idx1", "lib/b.ts", 12)`; `briefRefHref` returns `null` without repo or sha.
  - [ ] AC-12: the button and link have `color: var(--accent-text)` and class `mono`; after `mouseEnter` the colour is `var(--accent-hover)`; the non-openable span has `color: var(--text-muted)`; no element has an inline `outline`.
  - [ ] `reason="Largest change"` renders the mono path and the reason inside the SAME button (e2e flow 13 clicks the reason text); a reason `<img src=x>` stays literal text.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run BriefFileLink src/test/css-vars.test.ts` → all pass

### T7 [W1] [frontend] `VerdictProvenance` info control + warning-style "Missing inputs"
- **Status:** done
- **Files (only these):** `…/PrBriefCard/_components/VerdictProvenance/{VerdictProvenance.tsx,index.ts,styles.ts,VerdictProvenance.test.tsx}`, `…/PrBriefCard/_components/BriefNotes/{BriefNotes.tsx,styles.ts,BriefNotes.test.tsx}` (`…` = `…/_components/OverviewTab/_components`)
- **Depends on:** T1
- **Covers:** SPEC-07/AC-7 (hover + keyboard focus, text in the accessible name, agent + date/time + brief provenance), SPEC-07/AC-12 (missing inputs = warning note; truncated note stays muted — spec decision 8)
- **Produces:**
  - `VerdictProvenance({ agentName, reviewedAt })`: text = `t("verdict.provenance", { agent: agentName ?? t("verdict.unknownAgent"), when: format.dateTime(new Date(reviewedAt), { dateStyle: "medium", timeStyle: "short" }) })`; `<button type="button" aria-label={text}>` with `Icon.Info` (`aria-hidden`); a `role="tooltip"` bubble with the same text, `id` from `useId`, linked by `aria-describedby` while open; open on `mouseenter` / `focus`; close on `mouseleave` after `CLOSE_DELAY_MS = 150` (re-enter cancels), immediately on `blur` / `Escape`. Bubble absolutely positioned under the icon, `maxWidth: 320`, `var(--bg-elevated)` + `var(--border)`.
  - `BriefNotes`: the missing-inputs block becomes a note box — `Icon.AlertTriangle` (`aria-hidden`, `var(--warn)`), `border: 1px solid var(--warn)`, `background: var(--warn-bg)`, title `var(--text-primary)`, items `var(--text-secondary)`; the truncated line stays outside the box with `color: var(--text-muted)` (was `--warn`). Same strings, same "render nothing when empty".
- **Insights:** `- 2026-11-05 — Closing a hover popover on the trigger's \`onMouseLeave\` breaks it even when the popover is a DOM child: the 6px gap between cell and popover leaves both, so it vanished before the cursor reached it … → close after a short delay (\`CLOSE_DELAY_MS\` 150) that \`mouseenter\` cancels; blur/Escape close immediately; also cap \`maxHeight\` to the space in the chosen direction (src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:59 → scheduleClose; helpers.ts:24 → placePopover).`; `- 2026-11-08 — \`useFormatter().dateTime(...)\` under a test \`NextIntlClientProvider\` without a \`timeZone\` prop logs next-intl \`ENVIRONMENT_FALLBACK\` warnings … → in tests that render dates pass \`timeZone="UTC"\` to the provider (…/ProjectContextView/ProjectContextView.test.tsx:119 → NextIntlClientProvider).`
- **Skill focus:** react — the delay timer is the only effect-like logic (cleared on unmount); react-testing-library — `getByRole("button", { name: /review run of/ })`, `getByRole("tooltip")`, fake timers for the close delay.
- **Steps:** VerdictProvenance (+ constants inline as module constant, styles, index) → its test → BriefNotes + styles → `BriefNotes.test.tsx`.
- **Acceptance criteria:**
  - [ ] AC-7: agent "Security Reviewer", `reviewedAt 2026-11-09T10:00:00Z` (UTC provider) → the button's accessible name contains "Security Reviewer's review run of", the formatted date/time and "come from the brief"; `focus` shows the tooltip with the same text, `blur` hides it; `mouseEnter` shows it, `mouseLeave` hides it only after 150 ms; `Escape` hides it; `agentName null` → "an agent's review run".
  - [ ] AC-12: missing inputs render inside an element with `border: 1px solid var(--warn)` and `background: var(--warn-bg)` containing "Missing inputs"; the "Truncated: …" line has `color: var(--text-muted)` and is outside that box; empty inputs + zero truncation → nothing rendered.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run VerdictProvenance BriefNotes src/test/css-vars.test.ts` → all pass

### T8 [W2] [frontend] `PrBriefCard`: "PR Brief" label + verdict banner around every brief state
- **Status:** done
- **Files (only these):** `…/PrBriefCard/{PrBriefCard.tsx,styles.ts,types.ts,index.ts,PrBriefCard.test.tsx}`, `…/PrBriefCard/_components/BriefBody/{BriefBody.tsx,index.ts,styles.ts}` (`…` = `…/_components/OverviewTab/_components`)
- **Depends on:** T1, T3, T5, T7
- **Covers:** SPEC-07/AC-1 (banner under the "PR Brief" label with the brief summary as its text), SPEC-07/AC-4 (no finished run → SPEC-06 look; review data error → note + Retry, brief usable), SPEC-07/AC-5 (verdict/chip/score kept in every brief state; Generate/Regenerate names unchanged), SPEC-07/AC-7 (info control in the banner title row), SPEC-07/AC-11 ("PR Brief" section label), SPEC-07/AC-12 (meta line small + muted)
- **Produces:**
  - `types.ts` = `BriefVerdict` (Contracts); `index.ts` adds `export type { BriefVerdict } from "./types";`.
  - `BriefBody` (private) = everything the card renders today below its old `<h3>`: model line + Generate/Regenerate button + no-files hint, generating `role="status"`, generate-error `role="alert"`, load error + Retry, outdated, summary / empty / skeleton, `BriefNotes`, `BriefMeta` — same strings, same names, same disabling rules (moved, not rewritten).
  - `PrBriefCard` props += `verdict = { state: "none" }`, `onRetryVerdict`. Renders `<section aria-labelledby={headingId}>` → `BriefSectionLabel id={headingId} icon="Sparkles"` "PR Brief" (`card.title`) → `ready`: `VerdictBanner verdict score findingsCount blockers summary={null} agentName={null} titleAside={<VerdictProvenance agentName reviewedAt />} body={<BriefBody …/>} stackOnNarrow` (imported from `../../../VerdictBanner`); `none` / `error`: today's bordered box (`s.root`) with `BriefBody`, and for `error` first a `role="alert"` row "Review verdict unavailable" + button "Retry" (`aria-label` `verdict.retry`) calling `onRetryVerdict`.
- **Insights:** `- 2026-11-08 — "Found multiple elements with the role status" in a test wrapped in \`<ToastProvider>\`: the provider always renders its own \`role="status" aria-live="polite"\` toast region … → \`getAllByRole("status").find((el) => el.textContent?.includes(<title>))\`, or render without ToastProvider when the component doesn't toast (src/lib/toast.tsx:90 → ToastProvider region; …/ContextTab/ContextTab.test.tsx → "a degraded index shows a banner").` (several `role="alert"` rows can coexist — scope by text); `- 2026-11-08 — \`useFormatter().dateTime(...)\` … pass \`timeZone="UTC"\` to the provider …`; `- 2026-11-06 — RESOLVED … keep any new score coloring on the kit's 75/50 thresholds …`.
- **Skill focus:** react — every state derived from props in render (early returns per `verdict.state`), no effects; frontend-ui-architecture — `BriefBody` / `VerdictProvenance` private `_components`, `VerdictBanner` imported via its `index.ts`; typescript — exhaustive `switch` on `verdict.state` with a `never` default.
- **Steps:** types + index → BriefBody (move) → PrBriefCard + styles → update `PrBriefCard.test.tsx` (provider gets `brief` + `prReview` messages, `timeZone="UTC"`; all existing cases keep passing with `verdict` omitted) + new cases.
- **Acceptance criteria:**
  - [ ] AC-1: `verdict ready` (request_changes, 6 findings, 2 blockers, score 61) + a stored brief → under heading "PR Brief" one banner with "Request changes", "6 findings · 2 blockers", "61", "PR SCORE" and the brief summary.
  - [ ] AC-4: `verdict none` → no verdict label, no "findings" chip, no "PR SCORE", no info button; the existing SPEC-06 cases (Generate, errors, outdated, notes, meta) pass unchanged. `verdict error` → "Review verdict unavailable" + Retry calling `onRetryVerdict`, and "Generate brief" still enabled and calling `onGenerate`.
  - [ ] AC-5: with `verdict ready`, each brief state keeps "Request changes" + chip + score: no brief → "No brief yet." + enabled "Generate brief" + "Risk Brief model: deepseek/deepseek-v4-flash"; `generating` → disabled button + "Generating brief…"; a 502 `brief_generation_failed` → the failure alert + "Retry"; `outdated` → "Outdated — generated for abcdef1" + "Regenerate"; `changed_files 0` → disabled + no-files hint; ready → summary.
  - [ ] AC-7: in `ready`, the info button (name contains the agent name) sits in the banner's title row.
  - [ ] AC-11: `getByRole("heading", { name: "PR Brief" })` has `textTransform: uppercase` and precedes the banner.
  - [ ] AC-12: the meta line has `fontSize: 12` and `color: var(--text-muted)`.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run PrBriefCard src/test/css-vars.test.ts` → all pass

### T9 [W2] [frontend] `RiskAreas`: compact expandable risk cards
- **Status:** done
- **Files (only these):** `…/RiskAreas/{RiskAreas.tsx,styles.ts,constants.ts,RiskAreas.test.tsx}`, `…/RiskAreas/_components/RiskCard/{RiskCard.tsx,index.ts,styles.ts}` (`…` = `…/_components/OverviewTab/_components`)
- **Depends on:** T1, T3, T6
- **Covers:** SPEC-07/AC-8 (collapsed card, keyboard toggle with `aria-expanded`, expanded explanation + all refs, independent, start collapsed), SPEC-07/AC-9 (risk ref with a range → `onOpenFile(path, range)`), SPEC-07/AC-10 (ref without range → file-level), SPEC-07/AC-11 ("Risk areas" section label), SPEC-07/AC-12 (bordered cards, kind icon coloured by severity, unknown kind → warning icon)
- **Produces:**
  - `RiskAreas({ risks, repoFullName, linkSha, onOpenFile: OpenDiffTarget })`: `BriefSectionLabel icon="AlertTriangle"` "Risk areas" (`block.risks`); `noRisks` when empty; else `<ul>` of `RiskCard` (key `${i}:${title}`).
  - `constants.ts`: `RISK_KIND_ICON` / fallback unchanged; `SEVERITY_ICON` replaced by `RISK_SEVERITY_COLOR: Record<BriefRisk["severity"], string>` = high `var(--crit)`, medium `var(--warn)`, low `var(--info)`.
  - `RiskCard({ risk, repoFullName, linkSha, onOpenFile })`, local `expanded` state (default false, not persisted): header row = kind icon (`aria-hidden`, colour from `RISK_SEVERITY_COLOR`), title (wraps), severity text `risk.severity.<sev>` in the same colour, then — collapsed — the first ref as `BriefFileLink` (`line=start_line`, `endLine=end_line`, `label=ref`) and `risk.moreRefs` when `refs.length > 1`; a `<button type="button" aria-expanded aria-controls={detailsId} aria-label={t(expanded ? "risk.collapse" : "risk.expand", { title })}>` with `Icon.ChevronDown` (rotated when open). Expanded → details region `id={detailsId}`: explanation as plain text (`pre-wrap`; omitted when empty) + every ref as `BriefFileLink`. Card body click per D12 (ignore clicks whose target is inside `button, a`; uses `briefRefHref`). Card: `border: 1px solid var(--border)`, radius 8, `var(--bg-elevated)`, `minWidth: 0`, `cursor: pointer`.
- **Insights:** `- 2026-11-04 — \`SeverityBadge\` labels ("Critical", "Warning", …) come from the hard-coded English \`SEV\` map in \`src/vendor/ui/primitives/tokens.ts\`, not next-intl → severity counters/badges won't translate … (src/vendor/ui/primitives/tokens.ts:6 → SEV).` (risk severities are high/medium/low: keep the translated text label, don't use `SeverityBadge`); `- 2026-11-08 — A focus ring showed after a MOUSE click on the full-width blast symbol row … find the real trigger … before copying the workaround (…/BlastRadiusPanel/helpers.ts:23 → preventMouseFocus).`
- **Skill focus:** react — the list item is a component (`RiskCard`), expand state pushed down into it; react-testing-library — `getByRole("button", { name: /Show details: …/ })` + `toHaveAttribute("aria-expanded", …)`; security — body-click `window.open` only with an href from `briefRefHref`, with `noopener,noreferrer`.
- **Steps:** constants → RiskCard (+ styles, index) → RiskAreas + styles → rewrite `RiskAreas.test.tsx` (`brief.json` provider).
- **Acceptance criteria:**
  - [ ] AC-8: two risks render collapsed: title, "High"/"Medium" text, the first ref, "+2 more" on the one with 3 refs and no "+N more" on the one with 1 ref; explanations are NOT in the document. Clicking "Show details: <title A>" (`aria-expanded` false → true, name → "Hide details: <title A>") shows A's explanation and all 3 refs while B stays collapsed; clicking again hides them. `keyDown Enter` on the toggle button works (native button). A risk with an empty explanation expands to only its ref.
  - [ ] AC-9/AC-10: clicking the in-diff ref `src/a.ts:38-50` calls `onOpenFile("src/a.ts", { start: 38, end: 50 })`; a ref without range calls `onOpenFile("src/b.ts", null)`; clicking the card body (title) calls `onOpenFile` for the first ref; clicking the toggle does not call `onOpenFile`.
  - [ ] AC-11: `getByRole("heading", { name: "Risk areas" })` is uppercase-styled.
  - [ ] AC-12: kind icon colour = `var(--crit)` for high, `var(--warn)` for medium, `var(--info)` for low; kind `"unknown_kind"` renders the AlertTriangle fallback; each card has `border: 1px solid var(--border)`; explanation `<img src=x onerror=alert(1)> **bold**` stays literal text.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run RiskAreas RiskCard src/test/css-vars.test.ts` → all pass

### T10 [W2] [frontend] `ReviewFocusList`: count badge, line targets, accent paths
- **Status:** done
- **Files (only these):** `…/_components/OverviewTab/_components/ReviewFocusList/{ReviewFocusList.tsx,styles.ts,ReviewFocusList.test.tsx}`
- **Depends on:** T1, T3, T6
- **Covers:** SPEC-07/AC-9 (an item with a line → `onOpenFile(file, { start: line, end: line })`), SPEC-07/AC-10 (file-level item → `onOpenFile(file, null)`; blast-only stays a GitHub link), SPEC-07/AC-11 (label with icon, count in a badge instead of "(N)"), SPEC-07/AC-12 (focus paths mono accent)
- **Produces:** `ReviewFocusList({ items, repoFullName, linkSha, onOpenFile: OpenDiffTarget })`: `BriefSectionLabel icon="ListChecks" count={items.length}` with `focus.title`; each item = `BriefFileLink` with `line = file_level ? null : line`, `label = fileLocation(file, line)`, `reason = item.reason` (reason stays INSIDE the link/button — e2e flow 13 clicks it); `noFocus` when empty; `<ol>` order kept.
- **Insights:** e2e: `- 2026-11-07 — CORRECTION of 2026-11-06 Open Question (flow 09 never executed): it ran in CI after PR #23 and turned \`e2e web\` red on main at \`wait --text "Description"\` — the \`SectionLabel\` renders uppercase … → a section label is never a \`wait --text\` target; wait for the seeded content under it …` (flow 13 waits for the reason text, not the new uppercase label — keep it that way).
- **Skill focus:** react-testing-library — `getAllByRole("listitem")` order, `getByRole("button", { name: "Open src/config.ts:12 in Files changed" })`; frontend-ui-architecture — only `../BriefFileLink` and `../BriefSectionLabel` index imports.
- **Steps:** component + styles → update `ReviewFocusList.test.tsx`.
- **Acceptance criteria:**
  - [ ] AC-11: three items → heading "Review focus — read these first" containing a badge "3"; no "(3)" text anywhere.
  - [ ] AC-9: clicking the item `src/config.ts:12` calls `onOpenFile("src/config.ts", { start: 12, end: 12 })`.
  - [ ] AC-10: the file-level item `bin/logo.png` shows no ":1" and calls `onOpenFile("bin/logo.png", null)`; the blast-only item `lib/x.ts:77` is a link to `githubBlobUrl(repo, sha, "lib/x.ts", 77)`.
  - [ ] AC-12: the path part is `mono` with `color: var(--accent-text)`; the reason text is inside the same button; a reason with HTML renders literally; `items: []` → "No review focus items.".
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run ReviewFocusList` → all pass

### T11 [W3] [frontend] Integration: Overview verdict data, page wiring (line URL + settle refresh)
- **Status:** done
- **Files (only these):** `…/_components/OverviewTab/{OverviewTab.tsx,helpers.ts,helpers.test.ts,OverviewTab.test.tsx}`, `…/page.tsx`
- **Depends on:** T1, T2, T4, T5, T8, T9, T10
- **Covers:** SPEC-07/AC-2 (newest finished run selection), SPEC-07/AC-4 (no finished run / load failure + Retry with real hooks), SPEC-07/AC-6 (banner follows the caches with no reload and 0 model calls; page calls the settle hook), SPEC-07/AC-9 (click → `?tab=diff&file=&line=&lineEnd=` → DiffTab), SPEC-07/AC-1 (end-to-end in the Overview); also closes the SPEC-06 follow-up T14.AC2 from `plans/pr-brief.md` (Risk areas in the left column — user decision 2026-11-09)
- **Produces:**
  - `helpers.ts`: `newestFinishedReview` (D5) and `toBriefVerdict` (D6; counts via `reviewCounts` from `../../helpers`; `reviewedAt = review.created_at`, `agentName = review.agent_name ?? null`).
  - `OverviewTab`: `onOpenFile: OpenDiffTarget`; calls `usePrReviews(prId)` and `usePrRuns(prId)` (same keys as the page — no extra requests); `verdict = toBriefVerdict({ reviews: r.data, runs: runs.data, failed: r.isError || runs.isError })`; passes `verdict` + `onRetryVerdict={() => { r.refetch(); runs.refetch(); }}` to `PrBriefCard`; passes `onOpenFile` through to `RiskAreas` / `ReviewFocusList`. Layout unchanged otherwise.
  - `page.tsx`: `useRefreshReviewsWhenRunsSettle(prId, reviewRunning)` next to `useRefreshIntentWhenRunsSettle`; `setTab` uses `withTab`; `openFileInDiff(path, lines?)` uses `withDiffFocus` in ONE `router.replace`; `const focus = diffFocusFrom(search)` → `<DiffTab … focusPath={focus.path} focusLines={focus.lines} />`.
- **Insights:** `- 2026-11-08 — To test real React Query polling / timeouts in a component … \`vi.mock("@/lib/api", importOriginal)\` overriding \`api.get/post\` with a mutable fake server so the REAL hooks run … (…/BlastRadiusPanel/BlastRadiusPanel.test.tsx:59 → vi.mock("@/lib/api"), :173 → useFakeTimers).` (the existing `OverviewTab.test.tsx` fake API must also answer `/pulls/:id/reviews` and `/pulls/:id/runs`); `- 2026-11-08 — "Found multiple elements with the role status" in a test wrapped in \`<ToastProvider>\` … scope with \`within\` …`; `- 2026-11-08 — Smart Diff … is NOT on \`main\` nor on branches cut from it …` (flat list only).
- **Skill focus:** next — the page stays a client component, the URL is the only source of the line target; frontend-ui-architecture — selection/derivation in `helpers.ts`, hooks in the container (`OverviewTab`), children presentational; react — no query data copied into state.
- **Steps:** helpers (+ test) → OverviewTab → page → update `OverviewTab.test.tsx` (provider adds `prReview` messages; fake API adds reviews/runs; existing 4 tests keep passing with the `onOpenFile` assertion updated to `("src/auth/service.ts", { start: 40, end: 40 })`).
- **Acceptance criteria:**
  - [ ] AC-2 (`helpers.test.ts`): reviews [R3 (run running), R2 (run failed), R1 (run done)] → R1; [R2 (no run_id), R1 (done)] → R2; a review whose run id is missing from the run list or whose run is cancelled is skipped; `verdict null` skipped; all skipped → null.
  - [ ] AC-4: `toBriefVerdict` → `none` while data is undefined, `error` when `failed`, `none` when no finished review. In `OverviewTab.test.tsx`, `/reviews` rejecting → "Review verdict unavailable", the brief summary still shows, and Retry issues a new `GET /reviews`.
  - [ ] AC-1/AC-6: with a done run + review (request_changes, score 61, 1 CRITICAL open + 1 WARNING) the Overview shows "Request changes", "2 findings · 1 blockers", "61" and the stored brief summary; after the fake API returns a newer done review (approve) and `["reviews"]` / `["pr-runs"]` are invalidated (what T2's hook does), the banner shows "Approve" without remounting; after the newest is removed and the keys invalidated, it shows the previous one, and with none left the SPEC-06 look; `apiPost` is never called.
  - [ ] SPEC-06 T14.AC2 (taken over): with a stored brief, the Risk areas section renders inside the LEFT (Intent) column — it is a descendant of the same column element as the Intent block, comes after the Intent content, and is NOT inside the Blast radius column (assert via the column containers, e.g. `within(leftColumn)` / `compareDocumentPosition`, not by text order alone); prove it can fail by moving `RiskAreas` into the right column.
  - [ ] AC-9: clicking the in-diff focus item calls `onOpenFile("src/auth/service.ts", { start: 40, end: 40 })`; `page.tsx` builds the URL only via `withDiffFocus` / `withTab` and passes `diffFocusFrom(search)` to `DiffTab` (code review: no inline `URLSearchParams` editing left in the page).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run OverviewTab` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run` → all pass (full client suite; the interim reds from Global constraints are gone)
  - CI only (`e2e web`, or WSL `cd e2e && npm run e2e:hermetic`; not runnable on native Windows): flow 13 still green — flow file unchanged.

## AC → task coverage

| AC | Tasks with an asserting test |
|---|---|
| SPEC-07/AC-1 | T5, T8, T11 |
| SPEC-07/AC-2 | T11 |
| SPEC-07/AC-3 | T1, T5 |
| SPEC-07/AC-4 | T8, T11 |
| SPEC-07/AC-5 | T8 |
| SPEC-07/AC-6 | T2, T11 |
| SPEC-07/AC-7 | T7, T8 |
| SPEC-07/AC-8 | T9 |
| SPEC-07/AC-9 | T1, T4, T6, T9, T10, T11 |
| SPEC-07/AC-10 | T4, T6, T9, T10 |
| SPEC-07/AC-11 | T3, T8, T9, T10 |
| SPEC-07/AC-12 | T6, T7, T8, T9, T10 |

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T1, T2, T3 | in parallel (multi-agent) · sequential T1 → T2 → T3 (single-agent) | each task's Verify + client typecheck |
| W1 | T4, T5, T6, T7 | in parallel (multi-agent) · sequential T4 → T5 → T6 → T7 (single-agent) | each task's Verify + client typecheck (known interim reds listed in Global constraints are allowed) |
| W2 | T8, T9, T10 | in parallel (multi-agent) · sequential T8 → T9 → T10 (single-agent) | each task's Verify + client typecheck (only `OverviewTab.test.tsx`'s `onOpenFile` assertion may still be red) |
| W3 | T11 | alone | full client suite + typecheck green; CI `e2e web` flow 13 green |

No migration, no server/reviewer-core change, so no cross-package runs.

## Risks · Review focus

- **Count parity (AC-3):** a second blocker formula would drift from the Agent runs tab. Owner T5 (`ReviewRunAccordion` uses `reviewCounts`), T11 (`toBriefVerdict` uses it). Note: the run timeline's `blockers` (`RunSummary.blockers`, agent gate) is deliberately NOT used.
- **Newest-finished selection & cache races (AC-2, AC-6):** a review is saved before its run is marked done, and the two lists refetch independently — a review whose run is unknown or running must be skipped (D5), and both keys must be invalidated on settle (T2) and on delete (existing hooks). Known limitation (follows the spec's Module interactions, D7): a run started OUTSIDE this page (MCP / another browser tab) while the PR page idles is not polled — `pr-active-runs` polls only while non-empty and `refetchOnWindowFocus` is off; it appears on the next tab mount after the 30 s `staleTime` or a reload. If the user wants it covered, the cheapest change is an idle `refetchInterval` on `["pr-active-runs", prId]` while Overview is mounted (adds periodic requests — conflicts with the NFR wording, so not planned). Owners T2, T11.
- **Line targeting (AC-9, AC-10):** off-by-one between old/new numbering, highlighting removed lines, re-scrolling on every re-render, and focus fights. Owner T4 (`findLineTarget` uses `newNo` of `add`/`ctx` only; one handled-target ref). jsdom lacks `scrollIntoView` (stub). Merge note (not a task): `local/all-lessons` has the controlled Smart Diff `FileCard` (client INSIGHTS 2026-11-09) — the line target must be re-applied there on merge.
- **e2e flow 13:** seeded #482 has a done run + review, so its Overview now shows the banner; the flow waits for the brief summary (still shown, in the banner) and clicks the first focus reason — which must stay inside the clickable element (T6, T10). Seeded focus items are file-level → AC-10 header path, unchanged. CI viewport risk from `plans/pr-brief.md` (Review focus at the bottom) still applies.
- **i18n / tokens:** new keys only in `brief.json` (T1); verdict strings reused from `prReview.json` through `VerdictBanner`; every new `var(--x)` must exist (css-vars guard in each styled task's Verify). `{agent}'s` / `isn't` are plain ICU apostrophes — T1's `node -e` check and T7/T4 render tests prove the output.

Overlap with `plans/pr-brief.md` "Verification follow-ups": T14.AC2 (Risk areas in the left column) — TAKEN OVER by T11 (user decision 2026-11-09; same `OverviewTab.test.tsx`); T2.AC2 (`useGenerateBrief` setQueryData order) — `brief.ts` is not touched here.

Follow-ups: none (the `focus.item` removal moved into T1).

## Open questions

- none
