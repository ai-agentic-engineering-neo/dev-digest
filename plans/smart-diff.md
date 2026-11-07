# Development Plan: Smart Diff

- **Status:** in progress (approved 2026-11-07 by the user) — paths/symbols verified against the code

> **Approved decisions (2026-11-07) — these OVERRIDE any conflicting task text below.**
> - **Q2 / C10:** "Hide findings (N)" / "Show findings (N)": N = number of **non-dismissed** findings from the latest review of each agent in the PR's files — i.e. `activeFindings(findings).length`, the same basis as dots/counters/"● N". The label is ALWAYS "Hide/Show findings (N)" — no "Hide comments" variant. The toggle is always rendered (C4) and **disabled when N = 0** (user, 2026-11-07 — regardless of GitHub comments; with 0 findings the toggle stays on "shown", so comments stay visible). T12 adds a test: two agents 5 + 3 non-dismissed + 1 dismissed → "Hide findings (8)"; RED mutation: count `findings.length` (dismissed included) → 9 → fails.
> - **Q3 / C15:** sticky group headers sit BELOW the sticky `PrDetailHeader`, offset by its measured height. T12 owns it: `PrDetailHeader` root gets `data-pr-detail-header` (T12 adds `…/_components/PrDetailHeader/PrDetailHeader.tsx` to its owned files — attribute only); a component-private hook `DiffTab/hooks/useStickyOffset.ts` measures that element with `ResizeObserver` (fallback 0 when absent / no ResizeObserver in jsdom) and returns px; `GroupHeader` takes a `stickyTop: number` prop (T7) used as `top`, `zIndex: 4`. No new CSS custom property (css-vars guard). T7 test: `stickyTop={64}` → style `top: 64px` and `position: sticky`; T12 test: the hook returns the element's height (mock `getBoundingClientRect`/ResizeObserver) and 0 without the element.
> - **Q4:** "Hide findings" hides finding cards, the out-of-patch block and GitHub comment threads only; line bars, line severity icons, file dots/counters and "● N" stay visible (as planned).
> - **Q5:** no migration; the client re-orders each group by `PrDetail.files` (GitHub order), as planned.
> - **Large-PR banner (user, 2026-11-07, supersedes the earlier `too_big: false`):** server sets `too_big = total_lines > SMART_DIFF_LARGE_PR_LINES` with `export const SMART_DIFF_LARGE_PR_LINES = 1000` in `server/src/modules/smart-diff/constants.ts`; `proposed_splits` stays `[]`. **T8** owns it: T8 appends that ONE constant to `constants.ts` (T4 owns the file in W1; T8 runs in W2 after T4 is done — sequential, no overlap) and uses it in `build.ts`; `smart-diff-build.test.ts` adds 1000 → `too_big: false`, 1001 → `true`; RED mutation `>` → `>=` fails the 1000 case. Banner text = `prReview.smartDiff.largeTitle` (T7/T12 unchanged).
- **Goal:** On the PR page's **Files changed** tab the user sees the diff in five role groups (core → tests → wiring → docs → boilerplate) built by a deterministic `GET /pulls/:id/smart-diff` (no model call), with the latest review of each agent shown inside the diff (group "● N", file dot + severity counters, finding card under the flagged line with Accept/Dismiss), and can switch back to GitHub's original order.
- **Specs:** [server/specs/smart-diff.md](../server/specs/smart-diff.md) (S1–S10) · [client/specs/smart-diff.md](../client/specs/smart-diff.md) (C1–C17)
- **Packages:** server · client · e2e
- **Out of scope:** `pseudocode_summary`, real `proposed_splits` (`too_big` IS computed: `total_lines > 1000` — see Approved decisions); findings of older reviews of the same agent; findings whose file is not in the PR (stay in the Findings panel); translating pre-existing hard-coded `DiffTab` strings other than the comments toggle this feature replaces ("Files changed · N files" stays as is); no DB migration.

## Global constraints

- **Vendor contract exception (user-approved, do not re-open):** ONLY task T0 edits `*/src/vendor/shared/**`, and only the `SmartDiffRole` line of `contracts/brief.ts`, byte-identical in both copies (`cmp` exit 0). pr-self-review reports it as a *waivable* critical (AGENTS.md "Do not touch" exception); the USER adds the waiver — no task writes `.claude/pr-self-review/waivers.json`. Every other new shape is module-local (server) / in `client/src/lib/types.ts` or the owning component (client). T0 is the one task allowed to touch both packages (user decision: one owner for both copies); it is tagged `[backend]` because the server copy is canonical.
- No migration in this feature (all tables exist: `pr_files`, `reviews`, `findings`). `server/src/db/migrations/**` is not touched.
- Path shorthand used in task Files lists: `…/DiffTab/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/` (full paths are in the File ownership map).
- Windows box: `pnpm <script>` may fail with "Access is denied" → call bins via node (commands below). Server `*.it.test.ts` run **one file at a time** (parallel runs flake: `dockerAvailable()` times out — server/INSIGHTS.md Open Questions 2026-11-05). Server `tsc -p tsconfig.json` checks only `src/**` (tsconfig `include`), so server test files are type-checked by vitest runs only.
- RED checks: every task names a test that fails without its change. When a RED check uses a temporary mutation, confirm it applied with `git diff --stat <file>` (non-empty) BEFORE reading the result, then revert (`git checkout -- <file>`, or re-apply the original with the Edit tool for files new in this task) and confirm the mutation is gone. Sources are checked out with CRLF (`core.autocrlf=true`), so scripted `str.replace` on `"\n"` silently matches nothing — use the Edit tool (server/INSIGHTS.md Tool notes 2026-11-07).
- Server ESM: relative imports carry `.js`. Layering: run `node scripts/check-architecture.mjs` in every server task — zero NEW violations; never `--update` to absorb one.
- Multi-tenancy (server): the PR is looked up by `(workspaceId, id)` BEFORE any read of `pr_files` / `reviews` / `findings` (child tables have no workspace filter of their own).
- Client: user-visible text only from `messages/en/prReview.json` → `smartDiff.*` (no literals in TSX); colors only from existing CSS vars (`src/test/css-vars.test.ts` must pass; never add a token to make it pass); components mounted in `/showcase` take strings as props (no `useTranslations` — the smoke test has no intl provider); import other components only through their `index.ts`.
- Client tests: `@testing-library/user-event` is NOT a dependency → use `fireEvent` from `@testing-library/react` (client/INSIGHTS.md Tool notes 2026-11-06). Hooks are `vi.mock`-ed; vary fixtures via a `let current = FIXTURE` + `afterEach` reset, never mutate a module fixture (client/INSIGHTS.md What Works 2026-11-04). `beforeEach` with a block body (client/INSIGHTS.md Recurring 2026-11-06).
- Query key for the new hook is exactly `["smart-diff", prId]`; it is invalidated next to every `["reviews", prId]` invalidation/refetch.

## Contracts (Wave 0)

```ts
// ---- T0: server/src/vendor/shared/contracts/brief.ts AND client/src/vendor/shared/contracts/brief.ts (byte-identical)
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']); // was ['core','wiring','boilerplate']
// SmartDiffFile, SmartDiffGroup, ProposedSplit, SmartDiff: unchanged.

// ---- REST (T11): GET /pulls/:id/smart-diff → 200 SmartDiff
//   params IdParams (uuid). Malformed id → 422 validation_error (app-wide handler, src/app.ts:115; spec S10).
//   PR not in caller's workspace / unknown → 404 not_found ("Pull request not found"). No model call, no GitHub call.
//   Body: groups = ALL five roles in order core, tests, wiring, docs, boilerplate (empty → files: []);
//   each file { path, additions, deletions, pseudocode_summary: null, finding_lines: number[] (sorted, unique) };
//   split_suggestion = { too_big: total_lines > SMART_DIFF_LARGE_PR_LINES /* 1000 */, total_lines: Σ(additions + deletions), proposed_splits: [] }.

// ---- T4: server/src/modules/smart-diff/constants.ts  (ONLY place with patterns + order)
export interface SmartDiffRule { role: SmartDiffRole; patterns: readonly string[] }
export const SMART_DIFF_RULES: readonly SmartDiffRule[];        // order: boilerplate, tests, wiring, docs (patterns = server spec table)
export const SMART_DIFF_FALLBACK_ROLE: SmartDiffRole;            // 'core'
export const SMART_DIFF_GROUP_ORDER: readonly SmartDiffRole[];   // ['core','tests','wiring','docs','boilerplate']
// ---- T4: server/src/modules/smart-diff/glob.ts
export function matchesGlob(path: string, pattern: string): boolean; // case-sensitive; '*' = any chars except '/'; '**/' = zero or more dirs; trailing '/**' = anything below; regex compiled once per pattern (module Map cache)
// ---- T4: server/src/modules/smart-diff/classify.ts
export function classifyWith(path: string, rules: readonly SmartDiffRule[]): SmartDiffRole; // first rule with a matching pattern wins, else SMART_DIFF_FALLBACK_ROLE
export function classifyFile(path: string): SmartDiffRole;  // = classifyWith(path, SMART_DIFF_RULES)

// ---- T5: server/src/modules/smart-diff/domain.ts (pure, no runtime imports)
export interface SmartDiffFileInput { path: string; additions: number; deletions: number }
export interface FindingAnchor { file: string; startLine: number }
export interface ReviewWithFindings {
  review: { id: string; agentId: string | null; kind: 'summary' | 'review'; createdAt: Date };
  findings: { file: string; startLine: number; dismissedAt: Date | null }[];
}
/** Per agentId (null = one bucket) the newest kind='review' row (createdAt desc, then id desc);
 *  its findings with dismissedAt === null, merged. No review → []. */
export function latestReviewFindings(rows: readonly ReviewWithFindings[]): FindingAnchor[];
// ---- T5: server/src/modules/smart-diff/ports.ts
export interface SmartDiffRepositoryPort { listFiles(prId: string): Promise<SmartDiffFileInput[]> } // pr_files of the PR, DB order
/** Satisfied structurally by container.reviewRepo (ReviewRepository.getPull / reviewsForPull). */
export interface SmartDiffReviewSource {
  getPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  reviewsForPull(prId: string): Promise<ReviewWithFindings[]>;
}
// ---- T5: container.ts → get smartDiffRepo(): SmartDiffRepositoryPort; ContainerOverrides.smartDiffRepo?: SmartDiffRepositoryPort

// ---- T8: server/src/modules/smart-diff/build.ts
export function buildSmartDiff(files: readonly SmartDiffFileInput[], findings: readonly FindingAnchor[]): SmartDiff;
// ---- T8: server/src/modules/smart-diff/service.ts
export interface SmartDiffDeps { reviewRepo: SmartDiffReviewSource; smartDiffRepo: SmartDiffRepositoryPort } // Container satisfies it
export class SmartDiffService { constructor(deps: SmartDiffDeps); forPull(workspaceId: string, prId: string): Promise<SmartDiff> }

// ---- T3: client/src/lib/types.ts (re-export) + client/src/lib/hooks/smart-diff.ts
export type { SmartDiff, SmartDiffRole, SmartDiffGroup, SmartDiffFile } from "@devdigest/shared";
export function useSmartDiff(prId: string | null | undefined): UseQueryResult<SmartDiff>;
//   queryKey ["smart-diff", prId], GET `/pulls/${prId}/smart-diff`, enabled: !!prId

// ---- T6: client/src/components/diff-viewer/findings.ts (exported from diff-viewer/index.ts)
export interface DiffFindingLabels {
  line: Record<Severity, string>;                            // accessible name of a line's severity icon: "blocker" | "warning" | "suggestion"
  outOfPatch: string;                                        // title of the end-of-file block
  severityCount: (severity: Severity, count: number) => string; // a11y name of one counter chip
  fileDot: (count: number) => string;                        // a11y name of the file dot
}
export interface DiffFindingApi {
  findings: FindingRecord[];  // latest review per agent, any file (viewer filters by path); dismissed included
  show: boolean;              // false → finding cards + out-of-patch block hidden; bars/icons/dots/counters stay
  renderCard: (f: FindingRecord) => React.ReactNode; // caller renders FindingCard + accept/dismiss
  labels: DiffFindingLabels;
}
export function findingLineKey(f: Pick<FindingRecord, "start_line">): string; // `RIGHT:${start_line}` (via lineKey)
export function partitionFindings(findings: readonly FindingRecord[], renderedKeys: ReadonlySet<string>):
  { matched: Map<string, FindingRecord[]>; outOfPatch: FindingRecord[] };
export function activeFindings(findings: readonly FindingRecord[]): FindingRecord[]; // dismissed_at === null
export function topSeverity(findings: readonly { severity: string }[]): Severity | null; // CRITICAL > WARNING > SUGGESTION
export function lineSeverities(findings: readonly { severity: string }[]): Severity[]; // distinct severities present, most severe first
// diff-viewer/index.ts also exports AUTO_EXPAND_MAX_LINES (T6).

// ---- T10: diff-viewer props (additive, optional — viewer works without them)
// DiffViewer({ files, commenting?, findings?: DiffFindingApi, expansion?: { isOpen(path: string): boolean; toggle(path: string): void } })
// FileCard({ file, commenting?, findings?: DiffFindingApi, open?: boolean, onToggle?: () => void })  // open undefined → internal state as today
// CodeLine({ ln, path, threads, commenting?, findings?: FindingRecord[], findingApi?: DiffFindingApi })  // (T6)

// ---- T9: client …/DiffTab/helpers.ts
export function latestReviewsPerAgent(reviews: readonly ReviewRecord[]): ReviewRecord[]; // same rule as server: kind 'review', per agent_id (null bucket), newest created_at then id
export function diffFindings(reviews: readonly ReviewRecord[], paths: ReadonlySet<string>): FindingRecord[]; // findings of latestReviewsPerAgent in PR files (dismissed included)
export function countFilesWithFindings(paths: readonly string[], findings: readonly FindingRecord[]): number; // files with ≥1 NON-dismissed finding
export function reviewTokens(latest: readonly ReviewRecord[], runs: readonly RunSummary[]): number; // Σ(tokens_in + tokens_out) of the runs whose run_id = a latest review's run_id; null tokens / unmatched / run_id null → 0
export interface DiffGroupView { role: SmartDiffRole; files: PrFile[] }
export function buildGroupViews(smart: SmartDiff, files: readonly PrFile[]): DiffGroupView[]; // always 5, SMART_DIFF_GROUP_ORDER
export function defaultFileOpen(role: SmartDiffRole, file: Pick<PrFile, "additions" | "deletions">): boolean;
// RunSummary (@devdigest/shared, client/src/vendor/shared/contracts/trace.ts:96): run_id: string; tokens_in / tokens_out: number | null.
// ReviewRecord.run_id: string | null (contracts/review-api.ts:27).
```

## File ownership map

| File | Task | New / Modified |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | T0 | modified (1 line) |
| `client/src/vendor/shared/contracts/brief.ts` | T0 | modified (same line, byte-identical) |
| `server/test/contracts.test.ts` | T0 | modified |
| `server/test/smart-diff-classify.test.ts` | T1 | new |
| `client/messages/en/prReview.json` | T2 | modified |
| `client/src/lib/types.ts` | T3 | modified |
| `client/src/lib/hooks/smart-diff.ts` | T3 | new |
| `client/src/lib/hooks/smart-diff.test.tsx` | T3 | new |
| `client/src/lib/hooks/index.ts` | T3 | modified |
| `client/src/lib/hooks/reviews.ts` | T3 | modified |
| `client/src/lib/hooks/reviews.test.tsx` | T3 | modified |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | T3 | modified |
| `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/hooks/useResultsData.ts` | T3 | modified |
| `server/src/modules/smart-diff/constants.ts` | T4 | new |
| `server/src/modules/smart-diff/glob.ts` | T4 | new |
| `server/src/modules/smart-diff/classify.ts` | T4 | new |
| `server/test/smart-diff-purity.test.ts` | T4 | new |
| `server/src/modules/smart-diff/domain.ts` | T5 | new |
| `server/src/modules/smart-diff/ports.ts` | T5 | new |
| `server/src/modules/smart-diff/repository.ts` | T5 | new |
| `server/src/platform/container.ts` | T5 | modified |
| `server/test/smart-diff-domain.test.ts` | T5 | new |
| `client/src/components/diff-viewer/findings.ts` | T6 | new |
| `client/src/components/diff-viewer/findings.test.ts` | T6 | new |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | T6 | modified |
| `client/src/components/diff-viewer/CodeLine/CodeLine.test.tsx` | T6 | new |
| `client/src/components/diff-viewer/styles.ts` | T6 | modified |
| `client/src/components/diff-viewer/index.ts` | T6 | modified |
| `client/src/components/finding-card/index.ts` | T6 | modified |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/GroupHeader/{GroupHeader.tsx,index.ts,styles.ts,GroupHeader.test.tsx}` | T7 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/LargePrBanner/{LargePrBanner.tsx,index.ts,styles.ts,LargePrBanner.test.tsx}` | T7 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/DiffToolbar/{DiffToolbar.tsx,index.ts,styles.ts,DiffToolbar.test.tsx}` | T7 | new |
| `client/src/components/showcase/Showcase.tsx` | T7 | modified |
| `server/src/modules/smart-diff/build.ts` | T8 | new |
| `server/src/modules/smart-diff/constants.ts` | T8 (W2, after T4) | modified — append `SMART_DIFF_LARGE_PR_LINES = 1000` only |
| `server/src/modules/smart-diff/service.ts` | T8 | new |
| `server/test/smart-diff-build.test.ts` | T8 | new |
| `server/test/smart-diff-service.test.ts` | T8 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts` | T9 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.test.ts` | T9 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/constants.ts` | T9 | new |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | T10 | modified |
| `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` | T10 | new |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | T10 | modified |
| `server/src/modules/smart-diff/routes.ts` | T11 | new |
| `server/src/modules/index.ts` | T11 | modified |
| `server/test/smart-diff-routes.it.test.ts` | T11 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | T12 | modified |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` | T12 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/styles.ts` | T12 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/hooks/useDiffTabData.ts` | T12 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts,styles.ts}` | T12 | new |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/hooks/useStickyOffset.ts` | T12 | new (Approved decisions Q3) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx` | T12 | modified (attribute `data-pr-detail-header` only — Q3) |
| `e2e/specs/10-smart-diff.flow.json` | T13 | new |
| `e2e/specs/README.md` | T13 | modified |
| `e2e/README.md` | T13 | modified |

## Tasks

### T0 [W0] [backend] Contract: `SmartDiffRole` with five roles in both vendor copies
- **Status:** done
- **Files (only these):** `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `server/test/contracts.test.ts`
- **Depends on:** —
- **Produces:** `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])` in both copies (Contracts block).
- **Insights:**
  - server/INSIGHTS.md 2026-11-05 "`/pr-self-review` marks ANY edit under `*/src/vendor/shared/**` as a NON-waivable critical…" (../.claude/skills/pr-self-review/scripts/checks.mjs:69 → policy/do-not-touch-vendor-shared) — SUPERSEDED for this case by the AGENTS.md "Do not touch" exception: the same change byte-identical in both copies is waivable; the user adds the waiver.
  - client/INSIGHTS.md 2026-11-05 same rule (src/lib/types.ts:67) — same supersession.
- **Skill focus:** zod (enum only, nothing else in the file changes); security (do not write `.claude/pr-self-review/waivers.json`).
- **Steps:**
  1. In `server/test/contracts.test.ts` add `it('SmartDiff accepts all five roles and rejects an unknown role')`: `SmartDiff.parse` of a body with five groups (`core`, `tests`, `wiring`, `docs`, `boilerplate`, `files: []` allowed) succeeds; `SmartDiff.safeParse` with role `'generated'` → `success === false`. Run it → RED.
  2. Edit line 81 of the server copy with the Edit tool to the five-role enum. Make the identical edit in the client copy. Change nothing else.
  3. `cmp server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → exit 0.
- **RED check:** the new contracts test fails before step 2 (`Invalid enum value … 'tests'`); passes after.
- **Acceptance criteria:**
  - [ ] S1: both copies byte-identical (`cmp` exit 0), enum has the five roles; contracts test parses 5 roles and rejects an unknown one.
  - [ ] `git diff --stat` shows exactly these 3 files; `.claude/pr-self-review/waivers.json` untouched.
- **Verify:**
  - repo root: `cmp server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → exit 0, no output
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/contracts.test.ts` → all pass
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd reviewer-core && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors (reviewer-core type-checks against the server vendor copy)

### T1 [W0] [backend] Classifier table test (written FIRST, RED)
- **Status:** done
- **Files (only these):** `server/test/smart-diff-classify.test.ts`
- **Depends on:** —
- **Produces:** the executable spec for T4 (imports `classifyFile`, `classifyWith` from `../src/modules/smart-diff/classify.js` and `SMART_DIFF_RULES`, `SMART_DIFF_GROUP_ORDER` from `../src/modules/smart-diff/constants.js`).
- **Insights:** server/INSIGHTS.md 2026-11-07 "`core.autocrlf=true` checks server sources out with CRLF, so a scripted mutation … silently matched nothing … confirm it took (`git diff --stat <file>` non-empty)" (src/modules/intent/schemas.ts:35).
- **Skill focus:** typescript-expert (table typed `[path: string, role: SmartDiffRole][]`, `it.each`); no implementation in this task.
- **Steps:**
  1. `describe('classifyFile')` with `it.each(TABLE)('%s → %s')`. Rows (≥1 per pattern, core fallback, disputed cases, edges):
     - boilerplate: `pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `e2e/package-lock.json` (boilerplate beats `e2e/**`), `yarn.lock`, `Cargo.lock`, `dist/index.js` (beats `**/index.js`), `packages/ui/build/main.js`, `src/__snapshots__/App.test.tsx.snap`, `src/foo.snap`, `src/api.generated.ts`, `public/vendor/jquery.min.js`, `__tests__/__snapshots__/x.snap` (disputed).
     - tests: `server/test/contracts.test.ts`, `src/App.test.tsx`, `src/util.test.ts`, `server/src/foo.it.test.ts`, `src/foo.spec.ts`, `server/test/helpers/pg.ts`, `tests/fixtures/data.json`, `src/__tests__/util.ts`, `e2e/specs/05-pr-diff.flow.json`, `e2e/README.md` (disputed).
     - wiring: `client/src/lib/hooks/index.ts`, `index.js`, `vitest.config.ts`, `client/next.config.mjs`, `tsconfig.json`, `server/tsconfig.build.json`, `.eslintrc.cjs`, `.env.example`, `docker-compose.yml`, `docker-compose.test.yml`, `.github/workflows/ci.yml`, `.claude/skills/security/SKILL.md` (disputed).
     - docs: `README.md`, `server/docs/architecture.md`, `docs/diagram.png`, `client/README`, `CHANGELOG.txt`, `LICENSE`, `packages/x/LICENSE`.
     - core: `package.json`, `server/src/db/migrations/0015_x.sql`, `client/messages/en/prReview.json`, `server/src/modules/smart-diff/classify.ts`, `src/build.ts` (not a `build/` dir), `src/index.tsx` (not a barrel pattern), `LICENSE.txt` (exact `LICENSE` only), `src/Test/foo.ts` (case-sensitive).
  2. `it('rule order lives in SMART_DIFF_RULES')`: `SMART_DIFF_RULES.map(r => r.role)` equals `['boilerplate','tests','wiring','docs']`; `SMART_DIFF_GROUP_ORDER` equals `['core','tests','wiring','docs','boilerplate']`; for every table row `classifyFile(p) === classifyWith(p, SMART_DIFF_RULES)`.
  3. `it('a reordered rule list flips the disputed cases')` (S3): with the docs rule moved before wiring and tests, `classifyWith('.claude/skills/security/SKILL.md', reordered)` → `'docs'` and `classifyWith('e2e/README.md', reordered)` → `'docs'`; with tests before boilerplate, `classifyWith('__tests__/__snapshots__/x.snap', …)` → `'tests'`. Build the reordered lists from `SMART_DIFF_RULES` entries (no pattern literals duplicated).
- **RED check:** `node node_modules/vitest/vitest.mjs run test/smart-diff-classify.test.ts` fails with "Failed to load url ../src/modules/smart-diff/classify.js" (module does not exist yet). Record the failure output in the task report.
- **Acceptance criteria:**
  - [ ] S2 table present with ≥1 row per spec pattern, the core fallback and the 3 disputed cases exactly as pinned.
  - [ ] S3 reorder test present.
  - [ ] The test file is RED (missing module) at the end of this task; it turns green in T4 without edits.
- **Verify:**
  - `cd server && node node_modules/vitest/vitest.mjs run test/smart-diff-classify.test.ts` → FAILS only with the missing `smart-diff/classify.js` (or `constants.js`) module — expected for this task
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors (tsconfig includes only `src/**`)

### T2 [W0] [frontend] i18n keys `prReview.smartDiff`
- **Status:** done
- **Files (only these):** `client/messages/en/prReview.json`
- **Depends on:** —
- **Produces:** keys under `prReview.smartDiff` (existing kept: `coreLabel`, `wiringLabel`, `boilerplateLabel`, `largeTitle`, `largeBody`, `filesCount`, `findingLines`, `groupedByRole`). Add exactly:
  - `testsLabel` "Tests", `docsLabel` "Docs"
  - `coreDescription` "The substance of the change — review closely", `testsDescription` "Test files and fixtures", `wiringDescription` "Hooks the core into the app", `docsDescription` "Documentation and licensing", `boilerplateDescription` "Generated / mechanical — skim"
  - `filesWithFindings` "● {count}", `filesWithFindingsHint` "{count, plural, one {# file has} other {# files have}} findings"
  - `expandAll` "Expand all", `collapseAll` "Collapse all"
  - `toolbarLabel` "Diff view", `smartOrder` "Smart order", `originalOrder` "Original order"
  - `hideFindings` "Hide findings ({count})", `showFindings` "Show findings ({count})"
  - `notRunYet` "Review not run yet — findings will appear here"
  - `tokensNote` "0 new tokens · built on {tokens, number} from last review" (C12; next-intl formats 2000 → "2,000" in `en`)
  - `outOfPatch` "Findings outside the changed lines"
  - `lineLabelBlocker` "blocker", `lineLabelWarning` "warning", `lineLabelSuggestion` "suggestion" (accessible names of the line severity icons, C7)
  - `severityCount` "{count} {severity, select, CRITICAL {critical} WARNING {warning} other {suggestion}}"
  - `fileDot` "{count, plural, one {# finding} other {# findings}} in this file"
  - `loadError` "Couldn't load the smart diff"
- **Insights:** client/INSIGHTS.md 2026-11-05 "`messages/en/prReview.json` repeats key names across namespaces (`filesCount` in `smartDiff` AND `list` …) so a text edit anchored on a key (first match) put a block into `smartDiff` … → anchor on the namespace's unique neighbour key and verify with `node -e …`" (messages/en/prReview.json:61, :107 → filesCount). Anchor the edit on `"groupedByRole"` (unique, last key of `smartDiff`).
- **Skill focus:** frontend-ui-architecture §2 row 4 (all user-visible text in messages; ICU args).
- **Steps:** insert the keys after `groupedByRole` inside `smartDiff`; keep valid JSON; no other namespace changes.
- **RED check:** before the edit, `cd client && node -e "const m=require('./messages/en/prReview.json');const need=['testsLabel','docsLabel','coreDescription','testsDescription','wiringDescription','docsDescription','boilerplateDescription','filesWithFindings','filesWithFindingsHint','expandAll','collapseAll','toolbarLabel','smartOrder','originalOrder','hideFindings','showFindings','notRunYet','tokensNote','outOfPatch','lineLabelBlocker','lineLabelWarning','lineLabelSuggestion','severityCount','fileDot','loadError'];const miss=need.filter(k=>!(k in m.smartDiff));if(miss.length||!m.list.filesCount||!m.list.findings){console.error('missing',miss);process.exit(1)}"` exits 1; after, exits 0.
- **Acceptance criteria:**
  - [ ] C17 (keys part): every key above exists under `prReview.smartDiff`; `list.filesCount` and `list.findings` still exist; JSON parses.
- **Verify:**
  - the `node -e` command from RED check → exit 0
  - `cd client && node node_modules/vitest/vitest.mjs run FindingsPanel VerdictBanner` → all pass (namespace still loads)

### T3 [W0] [frontend] Data layer: `useSmartDiff`, types, invalidations
- **Status:** done
- **Files (only these):** `client/src/lib/types.ts`, `client/src/lib/hooks/smart-diff.ts`, `client/src/lib/hooks/smart-diff.test.tsx`, `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/reviews.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/hooks/useResultsData.ts`
- **Depends on:** —
- **Produces:** `useSmartDiff(prId)` (Contracts); `types.ts` line 37 becomes `export type { PrBrief, SmartDiff, SmartDiffRole, SmartDiffGroup, SmartDiffFile } from "@devdigest/shared";`.
- **Insights:**
  - client/INSIGHTS.md 2026-11-05 "Agent-card skill counts use `useQueries` with the SAME key … → invalidate exactly that key after any link change" (src/lib/hooks/skills.ts:98 → useAgentSkillCounts).
  - client/INSIGHTS.md 2026-11-06 "`beforeEach(() => post.mockReset())` returns the mock … → always give `beforeEach` a block body" (src/lib/hooks/reviews.test.tsx:33).
  - client/INSIGHTS.md 2026-11-04 "SSE uses `new EventSource(...)` in `hooks/reviews.ts` — the one sanctioned bypass of `api.ts`" — `useSmartDiff` uses `api.get`.
- **Skill focus:** react-best-practices (server state only in TanStack Query); frontend-ui-architecture (hook in `src/lib/hooks/<domain>.ts`, re-exported from `index.ts`).
- **Steps:**
  1. `hooks/smart-diff.ts`: `"use client"`; `useSmartDiff` exactly as in Contracts (`api.get<SmartDiff>`).
  2. `hooks/index.ts`: `export * from "./smart-diff";`.
  3. `hooks/reviews.ts`: add `qc.invalidateQueries({ queryKey: ["smart-diff", prId] })` right after each `["reviews", prId]` invalidation in `useDeleteRun`, `useDeleteReview`, `useRunReview`, `useRunReviewsParallel`, `useFindingAction` (inside its `if (prId)`).
  4. `page.tsx` `onRunDone`: add `if (prId) qc.invalidateQueries({ queryKey: ["smart-diff", prId] });` next to `refetchReviews()`. No other page change. (`onRunDone` already invalidates `["pr-runs", prId]` via `invalidateRunHistory`, which the C12 tokens note reads.)
  5. `useResultsData.ts`: add the same invalidation next to `["reviews", prId]` in the settled effect.
  6. Tests: `smart-diff.test.tsx` (mock `../api` like reviews.test.tsx): fetches `/pulls/pr1/smart-diff` and returns data; no call when `prId` is null. `reviews.test.tsx`: extend the `useRunReviewsParallel` test with `toContainEqual(["smart-diff","pr1"])`; add one test per mutation (`useFindingAction` with `prId: "pr1"`, `useDeleteRun("pr1")`, `useDeleteReview("pr1")`, `useRunReview` with `{ prId: "pr1" }`) asserting both `["reviews","pr1"]` and `["smart-diff","pr1"]` are invalidated (extend the existing `vi.mock("../api")` factory with `del`).
- **RED check:** the new `["smart-diff","pr1"]` assertions in `reviews.test.tsx` fail before step 3; `smart-diff.test.tsx` fails (missing module) before step 1.
- **Acceptance criteria:**
  - [ ] C13 (invalidation part): every mutation that invalidates `["reviews", prId]` also invalidates `["smart-diff", prId]` (hook tests); page `onRunDone` and the multi-agent settle effect also invalidate it.
  - [ ] `useSmartDiff` uses key `["smart-diff", prId]` and is disabled without a prId.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/lib/hooks` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run MultiAgentResults` → all pass

### T4 [W1] [backend] Pure classifier: constants, glob helper, `classifyFile`
- **Status:** done
- **Files (only these):** `server/src/modules/smart-diff/constants.ts`, `server/src/modules/smart-diff/glob.ts`, `server/src/modules/smart-diff/classify.ts`, `server/test/smart-diff-purity.test.ts`
- **Depends on:** T0 (`SmartDiffRole` has `tests`/`docs`), T1 (the table test)
- **Produces:** `SMART_DIFF_RULES`, `SMART_DIFF_FALLBACK_ROLE`, `SMART_DIFF_GROUP_ORDER`, `matchesGlob`, `classifyWith`, `classifyFile` (Contracts).
- **Insights:**
  - server/INSIGHTS.md 2026-11-07 CRLF mutation entry (see T1) — mutations below via the Edit tool + `git diff --stat`.
  - server/INSIGHTS.md 2026-11-05 "Correction: layer rules moved to `.dependency-cruiser.cjs` and the check is now `node scripts/check-architecture.mjs` … never `--update` to absorb a new one" (scripts/check-architecture.mjs → keyOf).
- **Skill focus:** onion-architecture (pure: only `import type { SmartDiffRole } from '@devdigest/shared'` + local `./constants.js` / `./glob.js`; no `node:*`, Fastify, Drizzle, `src/db`, `src/adapters`); typescript-expert (`satisfies readonly SmartDiffRule[]`, no `any`); security (patterns are constants; escape regex metachars when compiling).
- **Steps:**
  1. `constants.ts`: patterns copied verbatim from the server spec table, rules in order boilerplate → tests → wiring → docs; `SMART_DIFF_FALLBACK_ROLE = 'core'`; `SMART_DIFF_GROUP_ORDER`.
  2. `glob.ts`: `matchesGlob(path, pattern)` — translate `**/` → `(?:.*/)?`, trailing `/**` → `/.*`, `*` → `[^/]*`, escape every other regex metachar, anchor `^…$`; cache compiled RegExp per pattern in a module-level `Map`. No dependency added.
  3. `classify.ts`: `classifyWith` iterates `rules` in order and returns the first `rule.role` with a matching pattern; else fallback. `classifyFile(path) = classifyWith(path, SMART_DIFF_RULES)`.
  4. `smart-diff-purity.test.ts` (S4): read `src/modules/smart-diff/{classify,constants,glob}.ts` as text (`node:fs` in the TEST is fine) and assert no import specifier matches `/^(fastify|@fastify\/|drizzle-orm|postgres|node:)/` and none contains `/db/`, `/adapters/`, `/platform/`; the only non-relative import is `@devdigest/shared`, and it is `import type`.
- **RED check:** (a) T1's `test/smart-diff-classify.test.ts` is red before this task and green after, untouched. (b) Mutation: move the `docs` rule before `wiring` in `SMART_DIFF_RULES` (Edit tool) → `git diff`/file content shows the swap → classify row `.claude/skills/security/SKILL.md → wiring` fails → restore. (c) Mutation: add `import 'node:fs';` to `classify.ts` → purity test fails → remove.
- **Acceptance criteria:**
  - [ ] S2: T1 table test passes unchanged.
  - [ ] S3: order exists only in `constants.ts`; `classify.ts` iterates `SMART_DIFF_RULES`; reorder test passes.
  - [ ] S4: purity test passes; architecture check adds no violation.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/smart-diff-classify.test.ts test/smart-diff-purity.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T5 [W1] [backend] Domain rule (latest review per agent), ports, `pr_files` repository, container getter
- **Status:** done
- **Files (only these):** `server/src/modules/smart-diff/domain.ts`, `server/src/modules/smart-diff/ports.ts`, `server/src/modules/smart-diff/repository.ts`, `server/src/platform/container.ts`, `server/test/smart-diff-domain.test.ts`
- **Depends on:** —
- **Produces:** `latestReviewFindings`, domain types, `SmartDiffRepositoryPort`, `SmartDiffReviewSource`, `SmartDiffRepository implements SmartDiffRepositoryPort`, `container.smartDiffRepo`, `ContainerOverrides.smartDiffRepo` (Contracts).
- **Insights:**
  - server/INSIGHTS.md 2026-11-04 "There is no base-repository/workspace guard; scoping is manual per query → always add `eq(t.x.workspaceId, workspaceId)` from `getContext`" (src/modules/_shared/context.ts:14). `pr_files` has no workspace_id: `listFiles(prId)` is called only after `reviewRepo.getPull(workspaceId, prId)` succeeded (T8).
  - server/INSIGHTS.md 2026-11-04 "`ReviewService` builds `new ReviewRepository(container.db)` instead of `container.reviewRepo` → prefer the container getter in new code" (src/modules/reviews/service.ts:34).
  - server/INSIGHTS.md 2026-11-06 top-N-per-group window query (src/modules/agents/repository.ts:176) — NOT used here: the spec routes reviews/findings through `container.reviewRepo.reviewsForPull` (src/modules/reviews/repository.ts:63); selection is the pure `latestReviewFindings`.
- **Skill focus:** onion-architecture (domain.ts has no runtime imports; Drizzle only in repository.ts; repository returns `SmartDiffFileInput[]`, never `$inferSelect` rows); drizzle-orm-patterns (select only `path, additions, deletions` — no `patch`).
- **Steps:**
  1. `domain.ts`: types + `latestReviewFindings` (Contracts). Ignore `kind === 'summary'`; group by `agentId` with `null` as one bucket; newest by `createdAt`, then `id` desc; keep findings with `dismissedAt === null`; return `{ file, startLine }[]`.
  2. `ports.ts`: `SmartDiffRepositoryPort`, `SmartDiffReviewSource` (import types from `./domain.js` only).
  3. `repository.ts`: `export class SmartDiffRepository implements SmartDiffRepositoryPort { constructor(private readonly db: Db) {} listFiles(prId) }` — `db.select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions }).from(t.prFiles).where(eq(t.prFiles.prId, prId))`, no ORDER BY (pr_files has no ordinal; DB order = insert order of the last GitHub sync — Q5; the client orders by PR detail order).
  4. `container.ts`: import `SmartDiffRepository` + `type SmartDiffRepositoryPort`; field `_smartDiffRepo?`; getter `get smartDiffRepo(): SmartDiffRepositoryPort` with override first (same shape as the `conventionsRepo` getter, container.ts:127); `ContainerOverrides.smartDiffRepo?: SmartDiffRepositoryPort`.
  5. `smart-diff-domain.test.ts` (S9 unit): agent A old review (finding line 3) + A new review (line 10, and line 11 dismissed), agent B one review (line 20), a `kind: 'summary'` row with a finding (line 99), two `agentId: null` reviews (old line 50, new line 60) → result = A-new 10, B 20, null-new 60 (not 3, 11, 99, 50); empty input → `[]`; equal `createdAt` → higher `id` wins.
- **RED check:** mutation: drop the `dismissedAt === null` filter in `latestReviewFindings` (Edit tool; confirm the file changed) → domain test fails (line 11 present) → restore.
- **Acceptance criteria:**
  - [ ] S9 (unit part): latest kind='review' per agent (null bucket), merged, dismissed excluded.
  - [ ] `container.smartDiffRepo` exists and is overridable; no new architecture violation.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/smart-diff-domain.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T6 [W1] [frontend] diff-viewer line level: findings partitioning, line bar + right-end severity icons, card under the line
- **Status:** done
- **Files (only these):** `client/src/components/diff-viewer/findings.ts`, `client/src/components/diff-viewer/findings.test.ts`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`, `client/src/components/diff-viewer/CodeLine/CodeLine.test.tsx`, `client/src/components/diff-viewer/styles.ts`, `client/src/components/diff-viewer/index.ts`, `client/src/components/finding-card/index.ts`
- **Depends on:** —
- **Produces:** `DiffFindingApi`, `DiffFindingLabels`, `findingLineKey`, `partitionFindings`, `activeFindings`, `topSeverity`, `lineSeverities` (Contracts); `diff-viewer/index.ts` additionally exports `type { DiffFindingApi, DiffFindingLabels }` and `AUTO_EXPAND_MAX_LINES`; `finding-card/index.ts` additionally exports `SEV_COLOR`, `SEV_COLOR_FALLBACK`; `CodeLine` props `findings?`, `findingApi?`; styles `findingBarFor(color)`, `s.findingIcons`, `s.findingCards`, `fileDotFor(color)` (the last is consumed by T10).
- **Insights:**
  - client/INSIGHTS.md 2026-11-04 "`Severity` in `src/vendor/ui/primitives/tokens.ts` includes `INFO`, but the Zod contract … has only CRITICAL/WARNING/SUGGESTION" — `topSeverity`/`lineSeverities`/labels are keyed on the contract `Severity`.
  - client/INSIGHTS.md 2026-11-04 Open Questions "`SeverityBadge` labels (\"Critical\", \"Warning\", …) come from the hard-coded English `SEV` map" — the line icons use `SeverityBadge compact` (icon only, no visible English label) wrapped in a `role="img"` span whose `aria-label` is the translated `labels.line[severity]` (same pattern as `SeverityTally`, src/components/severity-tally/SeverityTally.tsx:28).
  - client/INSIGHTS.md 2026-11-06 CORRECTION "`src/test/css-vars.test.ts` now exists … fails on any `var(--x)` not declared in a .css file" — use `SEV_COLOR` values (`--crit/--warn/--sugg`) and existing tokens only.
  - client/INSIGHTS.md 2026-11-06 "`@testing-library/user-event` is NOT a client dependency" → `fireEvent`.
- **Skill focus:** frontend-ui-architecture (diff-viewer imports finding-card only via its `index.ts`, `SeverityBadge` only from the `@devdigest/ui` barrel; diff-viewer never imports from `src/app`); react-best-practices (derive per-line findings, no state for them; key cards by `f.id`, icons by severity).
- **Steps:**
  1. `findings.ts`: pure helpers + interfaces (Contracts). `findingLineKey` uses `lineKey("RIGHT", start_line)` from `./comments`. `partitionFindings` mirrors `partitionThreads` (comments.ts:89): matched when `renderedKeys.has(findingLineKey(f))`, else `outOfPatch`. `lineSeverities` returns the distinct contract severities present, ordered CRITICAL → WARNING → SUGGESTION.
  2. `CodeLine.tsx`: when `findingApi` and `findings?.length`, let `active = activeFindings(findings)`. If `active` is non-empty: the row gets a colored left bar `findingBarFor(SEV_COLOR[topSeverity(active)] ?? SEV_COLOR_FALLBACK)` (most severe finding on the line), and at the RIGHT end of the line row (container `s.findingIcons`, pushed right after the line text) one `<span role="img" aria-label={findingApi.labels.line[sev]} title={…same}><SeverityBadge severity={sev} compact /></span>` per `lineSeverities(active)`. When `findingApi.show`, render `findingApi.renderCard(f)` for each finding (incl. dismissed) under the line inside `s.findingCards`, BEFORE comment threads. The "+" composer and comment threads behave exactly as today (composer independent of `commenting.showComments`).
  3. `styles.ts`: add `findingBarFor`, `s.findingIcons` (`marginLeft: "auto"`, inline-flex, gap), `s.findingCards`, `fileDotFor` (CSS vars only).
  4. Index exports as in Produces.
  5. Tests: `findings.test.ts` — `partitionFindings` with a finding on rendered `RIGHT:12` (matched), one on line 99 not rendered (outOfPatch), one whose line exists only as `LEFT:12` → outOfPatch; `topSeverity` order; `lineSeverities([SUGGESTION, CRITICAL, SUGGESTION])` → `["CRITICAL","SUGGESTION"]`; `activeFindings` drops dismissed. `CodeLine.test.tsx` — (a) "flagged line shows bar, right-end icons and card": an `add` line `newNo: 12` with one CRITICAL + one WARNING finding → `getByRole('img', { name: 'blocker' })` and `getByRole('img', { name: 'warning' })` present, the blocker icon comes before the warning icon (`compareDocumentPosition`) and both come after the line text node; the `renderCard` outputs (`<div>card f1</div>`, `<div>card f2</div>`) rendered under the line. (b) `show: false` → cards gone, icons stay. (c) only a dismissed finding → no `img` named blocker, card still renders. (d) C10 composer: `commenting.canComment: true, showComments: false` → `fireEvent.mouseEnter` the row → button "Add a comment on this line" → click → composer textbox visible.
- **RED check:** `CodeLine.test.tsx` (a) fails before step 2 (no icons/cards); mutation: render the icons BEFORE the line text (Edit tool, confirm with `git diff --stat`) → (a) fails on the position assertion → revert; mutation: render cards only when `!findingApi.show` → (a)/(b) fail → revert.
- **Acceptance criteria:**
  - [ ] C7: a finding on a rendered RIGHT line renders its card under that line; the line gets a left bar colored by its most severe active finding and, at its right end, one compact `SeverityBadge` icon per severity with accessible name blocker / warning / suggestion.
  - [ ] C9 (partition part): findings not on a rendered RIGHT line land in `outOfPatch`.
  - [ ] C10 (line part): `show: false` hides cards; composing a comment still works while threads are hidden.
  - [ ] `DiffViewer` without `findings` renders exactly as before (smoke test green).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/components/diff-viewer src/components/finding-card` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run src/test/css-vars.test.ts src/test/smoke.test.tsx` → all pass

### T7 [W1] [frontend] Presentational pieces: GroupHeader, LargePrBanner, DiffToolbar (+ /showcase)
- **Status:** done
- **Files (only these):** `…/DiffTab/_components/GroupHeader/{GroupHeader.tsx,index.ts,styles.ts,GroupHeader.test.tsx}`, `…/DiffTab/_components/LargePrBanner/{LargePrBanner.tsx,index.ts,styles.ts,LargePrBanner.test.tsx}`, `…/DiffTab/_components/DiffToolbar/{DiffToolbar.tsx,index.ts,styles.ts,DiffToolbar.test.tsx}`, `client/src/components/showcase/Showcase.tsx`
- **Depends on:** —
- **Produces (all i18n-free, strings as props, named + default export via `index.ts`):**
  - `GroupHeader({ color, findingFiles, allOpen, onToggleAll, labels: { title, description, files, findingFiles, findingFilesHint, toggleAll } })` — two parts (C2): **left** = color marker (a dot with `background: color`), `<h3>` with `labels.title`, the description in normal case (NOT uppercased — e2e waits on it); **right** (`s.right`, `marginLeft: "auto"`) = `labels.findingFiles` ("● N", `title`/`aria-label` = `findingFilesHint`) ONLY when `findingFiles > 0`, then `labels.files`, then `<button type="button" aria-expanded={allOpen}>` with `labels.toggleAll`, in exactly that order. Root style `position: "sticky"`, `top: GROUP_HEADER_STICKY_TOP` (module constant in its own `styles.ts`, value `0` — Q3), `zIndex: 4` (below PrDetailHeader's 5), opaque `background: "var(--bg-primary)"`.
  - `LargePrBanner({ title, body })` — `role="note"` block with title + body.
  - `DiffToolbar({ mode, onModeChange, findingsToggle, labels: { toolbar, smart, original } })` where `mode: "smart" | "original"` and `findingsToggle: { label: string; shown: boolean; disabled: boolean; onToggle: () => void }` (required) — ONE `role="group"` (`aria-label` = `labels.toolbar`) containing exactly three kit `Button`s in this order (C4): Smart order, Original order (`active` on the current mode), and the findings toggle (`icon` "EyeOff" when shown, "Eye" when hidden; `disabled` when nothing can be hidden).
  - `Showcase.tsx`: new `Group` "Smart Diff" mounting GroupHeader (one with `findingFiles={1}`, one with `0`), LargePrBanner, DiffToolbar with literal English strings and `var(--viz-1)` / `var(--text-muted)` colors.
- **Insights:**
  - client/INSIGHTS.md 2026-11-04 "`Gallery` (`src/components/showcase/Showcase.tsx`) is rendered by `src/test/smoke.test.tsx` with NO `NextIntlClientProvider` → components added to `/showcase` must not call `useTranslations`; take translated strings as props" (src/test/smoke.test.tsx:4).
  - client/INSIGHTS.md 2026-11-06 css-vars guard (see T6) and "the token is `--bg-elevated`" (src/vendor/ui/styles.css:14) — never `--bg-elev`, `--text`, `--text-dim`.
  - client/INSIGHTS.md 2026-11-06 `user-event` not a dependency → `fireEvent`.
- **Skill focus:** react-testing-library (query by role/name: `getByRole('heading', { level: 3 })`, `within(getByRole('group', { name }))`, `getAllByRole('button')`); react-best-practices (stateless components; `{findingFiles > 0 && …}`, never `{findingFiles && …}`).
- **Steps:** build the three components with `styles.ts` objects `s`. Tests:
  - GroupHeader: (a) "left holds label + description, right holds ● N, files, toggle in order" — title/description/files render; with `findingFiles={1}` the DOM order is title → description → "● 1" → "3 files" → toggle button (`compareDocumentPosition`); (b) "● N hidden at 0" — with `0` no "●" text; (c) clicking the toggle calls `onToggleAll`, `aria-expanded` follows `allOpen`; (d) root `toHaveStyle({ position: "sticky" })` (C15).
  - LargePrBanner: title + body visible.
  - DiffToolbar: (a) "one toolbar with three controls" — `within(getByRole('group', { name: 'Diff view' })).getAllByRole('button')` has length 3 with names Smart order, Original order, Hide findings (8) in that order; (b) clicking "Original order" calls `onModeChange("original")`; clicking the third calls `onToggle`; `disabled: true` → third button disabled.
- **RED check:** each `*.test.tsx` fails before its component exists. Mutations (Edit tool, confirm with `git diff --stat` / file content, then revert): render "● N" with `{findingFiles && …}` → GroupHeader (b) fails (renders "0"); render the toggle button before `labels.files` → GroupHeader (a) fails; render the findings toggle outside the `role="group"` → DiffToolbar (a) fails (2 buttons).
- **Acceptance criteria:**
  - [ ] C2 (header part): marker, label, description on the left; "● N", "{count} files", expand/collapse-all button on the right, in that order.
  - [ ] C5 (header part): "● N" before "{count} files", hidden at 0.
  - [ ] C4 (toolbar part): one toolbar, three controls in order; C10 (toolbar part); C14 (banner part); C15 (sticky).
  - [ ] Gallery smoke test green in both themes; css-vars guard green.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run GroupHeader LargePrBanner DiffToolbar` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run src/test/css-vars.test.ts src/test/smoke.test.tsx` → all pass

### T8 [W2] [backend] Builder + service
- **Status:** done
- **Files (only these):** `server/src/modules/smart-diff/build.ts`, `server/src/modules/smart-diff/service.ts`, `server/test/smart-diff-build.test.ts`, `server/test/smart-diff-service.test.ts`
- **Depends on:** T4 (`classifyFile`, `SMART_DIFF_GROUP_ORDER`), T5 (domain, ports)
- **Produces:** `buildSmartDiff`, `SmartDiffDeps`, `SmartDiffService.forPull` (Contracts).
- **Insights:**
  - server/INSIGHTS.md 2026-11-04 workspace scoping entry (see T5).
  - server/INSIGHTS.md 2026-11-04 `ReviewService` getter entry (see T5) — the service receives `reviewRepo` from the container and never constructs a repository.
- **Skill focus:** onion-architecture rule 3 (narrow deps interface, not the whole `Container`; no `drizzle-orm`/`db/*` import in build.ts/service.ts); typescript-expert (return type `SmartDiff` via `import type`).
- **Steps:**
  1. `build.ts`: each file → `{ path, additions, deletions, pseudocode_summary: null, finding_lines }` where `finding_lines` = ascending unique `startLine` of findings with `file === path`; groups = `SMART_DIFF_GROUP_ORDER.map(role => ({ role, files: inputs with classifyFile(path) === role, in input order }))`; `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
  2. `service.ts`: `forPull(workspaceId, prId)`: `const pull = await deps.reviewRepo.getPull(workspaceId, prId); if (!pull) throw new NotFoundError('Pull request not found');` THEN `Promise.all([deps.smartDiffRepo.listFiles(prId), deps.reviewRepo.reviewsForPull(prId)])` → `buildSmartDiff(files, latestReviewFindings(rows))`. `SmartDiffDeps` has no LLM, GitHub or git member.
  3. `smart-diff-build.test.ts` (S5): inputs with core + tests files only → exactly 5 groups in fixed order, `wiring`/`docs`/`boilerplate` have `files: []`; two core files keep input order; findings `[{a.ts,7},{a.ts,3},{a.ts,7},{b.ts,1}]` → `a.ts` `[3,7]`, `b.ts` `[1]`, a file without findings `[]`; `total_lines` = Σ; `too_big === false`; `proposed_splits` `[]`; every `pseudocode_summary === null`; output passes `SmartDiff.parse`.
  4. `smart-diff-service.test.ts` (fake deps, no Docker): unknown PR → rejects with `NotFoundError` and `listFiles`/`reviewsForPull` were NOT called; happy path returns 5 groups with finding lines from the latest review per agent; no review → all `finding_lines` `[]`.
- **RED check:** mutation: in `build.ts` filter out empty groups (Edit tool; confirm the file changed) → build test "includes empty groups" fails → restore; mutation: remove the `NotFoundError` throw → service test fails → restore.
- **Acceptance criteria:**
  - [ ] S5 build test green.
  - [ ] S7/S10 (service part): 404 before any child-table read.
  - [ ] S8 (service part): the service has no model/GitHub dependency.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/smart-diff-build.test.ts test/smart-diff-service.test.ts test/smart-diff-classify.test.ts test/smart-diff-domain.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T9 [W2] [frontend] DiffTab pure helpers + constants
- **Status:** done
- **Files (only these):** `…/DiffTab/helpers.ts`, `…/DiffTab/helpers.test.ts`, `…/DiffTab/constants.ts`
- **Depends on:** T0 (client enum has five roles), T3 (`SmartDiffRole`/`SmartDiff` from `@/lib/types`), T6 (`AUTO_EXPAND_MAX_LINES` from `@/components/diff-viewer`)
- **Produces:** helpers in Contracts (incl. `reviewTokens`); `constants.ts`: `SMART_DIFF_GROUP_ORDER: readonly SmartDiffRole[]` (`core, tests, wiring, docs, boilerplate`), `COLLAPSED_ROLES: ReadonlySet<SmartDiffRole>` (`docs`, `boilerplate`), `GROUP_COLOR: Record<SmartDiffRole, string>` = core `var(--viz-1)`, tests `var(--viz-5)`, wiring `var(--viz-4)`, docs `var(--viz-3)`, boilerplate `var(--text-muted)`; `GROUP_LABEL_KEY` / `GROUP_DESCRIPTION_KEY: Record<SmartDiffRole, string>` mapping to the T2 message keys (`coreLabel` … `boilerplateLabel`, `coreDescription` … `boilerplateDescription`).
- **Insights:** client/INSIGHTS.md 2026-11-06 css-vars guard (see T6) — `GROUP_COLOR` uses only the five existing vars above.
- **Skill focus:** frontend-ui-architecture §6 (domain rules as pure TS in `helpers.ts`, no React; types `ReviewRecord`, `FindingRecord`, `RunSummary` via `import type` from `@devdigest/shared`, as `src/lib/hooks/reviews.ts:10` does); react-best-practices (derive, don't store).
- **Steps:**
  1. `latestReviewsPerAgent`: same rule as server `latestReviewFindings` (kind `'review'`, group by `agent_id` with `null` as one bucket, newest `created_at` ISO string, tie → greater `id`).
  2. `diffFindings(reviews, paths)`: findings of those reviews whose `file` ∈ `paths` (dismissed included).
  3. `countFilesWithFindings(paths, findings)`: number of paths with ≥1 finding where `dismissed_at === null`.
  4. `reviewTokens(latest, runs)` (C12): build a `Map<run_id, RunSummary>`; for each review in `latest` with a non-null `run_id` found in the map add `(tokens_in ?? 0) + (tokens_out ?? 0)`; everything else adds 0.
  5. `buildGroupViews(smart, files)`: 5 groups in `SMART_DIFF_GROUP_ORDER` (a role missing from the response → empty group); each group's files = the `PrFile`s (with patch) whose path is in that group, ordered by their index in `files` (GitHub order); a smart-diff path absent from `files` → `{ path, additions, deletions, patch: null }`; a `files` path absent from every group → appended to `core`.
  6. `defaultFileOpen(role, file)`: `false` for `COLLAPSED_ROLES`, else `additions + deletions <= AUTO_EXPAND_MAX_LINES`.
  7. `helpers.test.ts`: agents A (old 5 / new 3 findings), B (2), a summary review, null-agent old/new → only A-new + B + null-new; a finding on a path outside the PR excluded; 1 file with 3 findings + 1 clean file → `countFilesWithFindings` 1 (C5); a file whose only finding is dismissed → 0; `reviewTokens` "sums the runs behind the latest review of each agent": A-new on run `r2` (tokens 1000 + 200), B on run `r3` (700 + 100), A-old on run `r1` (5000 + 5000, must NOT count), a run with `tokens_in: null, tokens_out: null` matched → 0, a latest review with `run_id: null` → 0 ⇒ `2000`; `buildGroupViews` with `wiring`/`docs` empty → 5 groups in order, empty ones `[]` (C1), in-group order follows `files`, missing/extra paths handled; `defaultFileOpen` (C3): small docs file → false, 10-line core file → true, 500-line core file → false.
- **RED check:** helpers test fails before helpers exist. Mutations (Edit tool, confirm with `git diff --stat` / file content, then revert): make `countFilesWithFindings` count findings instead of files → "1 file with 3 findings → 1" fails; make `reviewTokens` sum over ALL runs of the PR → `reviewTokens` test fails (12 000 instead of 2 000).
- **Acceptance criteria:**
  - [ ] C1/C3/C5 helper parts green; C12 tokens sum green; latest-per-agent rule identical to the server (basis for C10 N, C11 "has review" and C12).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run DiffTab/helpers` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run src/test/css-vars.test.ts` → pass

### T10 [W2] [frontend] diff-viewer file level: dot + severity counters, out-of-patch block, controlled expansion
- **Status:** done
- **Files (only these):** `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `client/src/components/diff-viewer/FileCard/FileCard.test.tsx`, `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`
- **Depends on:** T6
- **Produces:** `FileCard` props `findings?`, `open?`, `onToggle?`; `DiffViewer` props `findings?`, `expansion?` (Contracts). The expansion type is not exported — callers pass object literals.
- **Insights:**
  - client/INSIGHTS.md 2026-11-04 "`SeverityBadge` labels … come from the hard-coded English `SEV` map" — counters use `SeverityTally` (compact `SeverityBadge` + `count`) whose `label` prop = `labels.severityCount`, so the accessible name is translated.
  - client/INSIGHTS.md 2026-11-06 css-vars guard (see T6).
- **Skill focus:** react-best-practices (controlled-or-uncontrolled `open`: `open ?? internalOpen`, no effect syncing); frontend-ui-architecture (import `SeverityTally`, `countSeverities` from `@/components/severity-tally` and `SEV_COLOR*` from `@/components/finding-card` — index only).
- **Steps:**
  1. `FileCard`: `fileFindings = findings?.findings.filter(f => f.file === file.path) ?? []`; `active = activeFindings(fileFindings)`. Header, after the path: when `active.length > 0` a dot `fileDotFor(SEV_COLOR[topSeverity(active)] ?? SEV_COLOR_FALLBACK)` with `role="img"` + `aria-label={labels.fileDot(active.length)}`, then `<SeverityTally counts={countSeverities(active)} label={labels.severityCount} />`. The GitHub comment counter (`MessageSquare` + count) stays separate and unchanged.
  2. Body: reuse the `renderedKeys` set already built for threads and compute `partitionFindings(fileFindings, renderedKeys)`; pass each `CodeLine` the matched findings for its `keysForLine(ln)` + `findingApi`; at the end of the body, when `findings.show && outOfPatch.length > 0`, a block styled with `cs.outdatedWrap` / `cs.outdatedTitle` (comments.ts:158) titled `labels.outOfPatch` rendering `renderCard(f)` for each (also when `lines.length === 0`, i.e. patch null).
  3. Expansion: `isOpen = open ?? internalOpen`; header click → `onToggle ? onToggle() : setInternalOpen(o => !o)`.
  4. `DiffViewer`: pass `findings`, `open={expansion?.isOpen(f.path)}`, `onToggle={expansion ? () => expansion.toggle(f.path) : undefined}`; key FileCards by `f.path`.
  5. `FileCard.test.tsx` (wrap in `NextIntlClientProvider` with `shell` messages, like smoke.test.tsx): file with CRITICAL 1 + WARNING 2 (non-dismissed) + one GitHub comment → dot `getByRole('img', { name: '3 findings in this file' })` (labels from the test), counter chips named "critical 1"/"warning 2", the comment counter still shows 1 (C6); a finding on line 99 not in the patch renders under the out-of-patch title at the end of the body (C9); `show: false` hides it; a file whose only finding is dismissed → no dot, no counters; controlled `open={false}` hides lines and clicking the header calls `onToggle`.
- **RED check:** FileCard test "shows a dot and per-severity counters" fails before step 1; mutation: count all findings (incl. dismissed) for the dot → "only dismissed → no dot" fails → revert (confirm with `git diff --stat`).
- **Acceptance criteria:**
  - [ ] C6, C9 green; C11 (file part): no dot/counters without active findings.
  - [ ] smoke test "diff viewer parses a unified patch" still green (no findings/expansion props).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/components/diff-viewer` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run src/test/css-vars.test.ts src/test/smoke.test.tsx` → all pass

### T11 [W3] [backend] Route `GET /pulls/:id/smart-diff` + registration + integration test
- **Status:** done
- **Files (only these):** `server/src/modules/smart-diff/routes.ts`, `server/src/modules/index.ts`, `server/test/smart-diff-routes.it.test.ts`
- **Depends on:** T8
- **Produces:** the REST route (Contracts); registry key `smartDiff`.
- **Insights:**
  - server/INSIGHTS.md 2026-11-04 workspace scoping entry (see T5).
  - server/INSIGHTS.md Open Questions 2026-11-05 "Integration tests intermittently skip (`Docker not available`) or fail when the full suite runs in parallel … consider … running `.it.test.ts` files sequentially" — run only this file.
- **Skill focus:** fastify-best-practices (thin route: `schema: { params: IdParams, response: { 200: SmartDiff } }`, `getContext`, one service call; no `reply.status`); security (workspace-scoped 404, no LLM/GitHub).
- **Steps:**
  1. `routes.ts`: `export default async function smartDiffRoutes(appBase: FastifyInstance)`; `const app = appBase.withTypeProvider<ZodTypeProvider>(); const service = new SmartDiffService(app.container);`; route `GET /pulls/:id/smart-diff` → `const { workspaceId } = await getContext(app.container, req); return service.forPull(workspaceId, req.params.id);`. Header comment lists the route (intent/routes.ts:8 style).
  2. `modules/index.ts`: `import smartDiff from './smart-diff/routes.js';` + `smartDiff,` in `modules`.
  3. `smart-diff-routes.it.test.ts` (pattern: test/intent-routes.it.test.ts — `startPg`, `dockerAvailable`, `seed`, `buildApp` with overrides). In the test file define `class ThrowingLLM extends MockLLMProvider` overriding `listModels`, `complete`, `completeStructured`, `embed` to push to `calls` and throw; inject it for `openai`, `anthropic` and `openrouter`; `github: new MockGitHubClient()`, `secrets: new MockSecretsProvider()`. Seed a repo + PR with `pr_files` `src/core.ts`, `src/core.test.ts`, `src/index.ts`, `README.md`, `pnpm-lock.yaml`. Tests:
     - S8: before any review → 200; `SmartDiff.parse(body)` ok; 5 groups in order with each file in its expected group; every `finding_lines` `[]`; `split_suggestion` `{ too_big: false, total_lines: Σ, proposed_splits: [] }`; ThrowingLLM `calls.length === 0`.
     - S6/S9: insert reviews (random uuid agent ids): agent A old (finding `src/core.ts:3`) + A new (`src/core.ts:10`, and `src/core.ts:11` with `dismissedAt` set), agent B (`src/core.test.ts:5`), a `kind:'summary'` row (`src/core.ts:99`) → `src/core.ts` `[10]`, `src/core.test.ts` `[5]`; still zero LLM calls.
     - S7: PR in a second workspace (`insert(t.workspaces).values({ name: 'other' })`) → 404 `not_found`.
     - S10 "malformed id → 422": random well-formed uuid → 404 `not_found`; `GET /pulls/not-a-uuid/smart-diff` → status 422 and `res.json().error.code === 'validation_error'` (spec S10; app-wide handler src/app.ts:115-123; same assertion shape as test/routes-smoke.test.ts:63-64).
- **RED check:** before step 2 the S8 test gets 404 (route not registered) → fails; after, green. Mutation: comment out `smartDiff,` in `modules/index.ts` → `git diff --stat src/modules/index.ts` non-empty → S8 and S10-422 fail (unregistered route answers 404, not 422) → revert.
- **Acceptance criteria:**
  - [ ] S6, S7, S8, S9, S10 (404 for unknown uuid, 422 `validation_error` for a malformed id) green in `smart-diff-routes.it.test.ts` (with Docker; a `Docker not available` skip does NOT pass the gate — rerun alone).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/smart-diff-routes.it.test.ts` → all pass (not skipped)
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T12 [W3] [frontend] DiffTab integration: groups, toolbar, notes, findings in the diff
- **Status:** done
- **Files (only these):** `…/DiffTab/DiffTab.tsx`, `…/DiffTab/DiffTab.test.tsx`, `…/DiffTab/styles.ts`, `…/DiffTab/hooks/useDiffTabData.ts`, `…/DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts,styles.ts}`
- **Depends on:** T2, T3, T6, T7, T9, T10
- **Produces:** the finished Files changed tab. `DiffTab` props unchanged (`prId`, `filesCount`, `files`, `canComment`); `DiffTab/index.ts` unchanged.
- **Insights:**
  - client/INSIGHTS.md 2026-11-04 "To vary data a `vi.mock`-ed hook returns per test, never mutate the module-level fixture … hook reads a `let current = FIXTURE`, a test assigns a spread copy, `afterEach` resets it" (RunTraceDrawer.test.tsx:24).
  - client/INSIGHTS.md 2026-11-05 CORRECTION "`MutationCache.onError` in providers already toasts EVERY failed mutation … don't add a call-site toast" (src/lib/providers.tsx:39) — no toast around `useFindingAction`.
  - client/INSIGHTS.md 2026-11-04 "New UI missing on an already-open PR page … hard-reload (Ctrl+Shift+R)" — for manual checks.
  - client/INSIGHTS.md 2026-11-06 `user-event` not a dependency → `fireEvent`.
- **Skill focus:** react-best-practices (server data only from query hooks; view models via T9 helpers during render; expansion stored as overrides `Record<path, boolean>` read as `override ?? defaultFileOpen(...)`, no effects); frontend-ui-architecture (6 hooks → `hooks/useDiffTabData.ts`; group rendering in `_components/SmartDiffGroup`); next-best-practices (DiffTab stays a client component; no new route files).
- **Steps:**
  1. `hooks/useDiffTabData.ts`: calls `useSmartDiff(prId)`, `usePrReviews(prId)`, `usePrRuns(prId)` (key `["pr-runs", prId]`, src/lib/hooks/reviews.ts:41 — cached, the page already uses it), `usePrComments(prId)`, `useCreatePrComment(prId)`, `useFindingAction()`; derives `latest = latestReviewsPerAgent(reviews ?? [])` and returns `{ smart, comments, create, action, findings: diffFindings(reviews ?? [], new Set(files.map(f => f.path))), hasReview: latest.length > 0, tokens: runs.data ? reviewTokens(latest, runs.data) : null }`.
  2. `DiffTab.tsx` (`useTranslations("prReview")`): local state `mode: "smart" | "original"` (default `"smart"`) and `showFindings` (default `true`; replaces today's comments-only `showComments`, which started hidden). `commenting.showComments = showFindings`; after a successful post set `showFindings` to true (as today). `findingApi: DiffFindingApi = { findings, show: showFindings, renderCard: f => <FindingCard f={f} defaultExpanded pending={action.isPending} onAction={(a) => action.mutate({ findingId: f.id, action: a, prId })} />, labels }` with `labels.line` from `smartDiff.lineLabelBlocker/Warning/Suggestion`, `outOfPatch`, `severityCount`, `fileDot`. `SectionLabel` `right` = ONE `DiffToolbar` with all three controls (C4): `labels = { toolbar: toolbarLabel, smart: smartOrder, original: originalOrder }`, `findingsToggle = { label: t(showFindings ? "smartDiff.hideFindings" : "smartDiff.showFindings", { count: findings.length }), shown: showFindings, disabled: findings.length + commentCount === 0, onToggle }`. Under the label: when `!hasReview` the `notRunYet` text (C11); when `hasReview && tokens !== null` the `tokensNote` with `{ tokens }` (C12); neither otherwise. `LargePrBanner` (`largeTitle` with `lines = split_suggestion.total_lines`, `largeBody`) only when `smart.data?.split_suggestion.too_big`. Smart mode: loading → kit `Skeleton`; error → kit `ErrorState` (`title = smartDiff.loadError`, `onRetry = () => smart.refetch()`); data → `buildGroupViews(smart.data, files).map(g => <SmartDiffGroup key={g.role} …/>)`. Original mode: `<DiffViewer files={files} commenting={commenting} findings={findingApi} />` (flat, no group headers).
  3. `SmartDiffGroup({ group, commenting, findings })`: may call `useTranslations("prReview")` (not in /showcase); `overrides` state; `isOpen(path) = overrides[path] ?? defaultFileOpen(role, file)`; `allOpen = files.length > 0 && files.every(isOpen)`; toggle-all sets every path to `!allOpen`; renders `GroupHeader` (`color = GROUP_COLOR[role]`, title/description via `GROUP_LABEL_KEY`/`GROUP_DESCRIPTION_KEY`, `files = t("smartDiff.filesCount", { count })`, `findingFiles = countFilesWithFindings(paths, findings.findings)`, its label `t("smartDiff.filesWithFindings", { count })` and hint `filesWithFindingsHint`, toggle label `expandAll`/`collapseAll`) and, when the group has files, `<DiffViewer files={group.files} commenting={commenting} findings={findings} expansion={{ isOpen, toggle }} />`.
  4. `DiffTab.test.tsx` (mock `@/lib/hooks/smart-diff` and `@/lib/hooks/reviews` incl. `usePrRuns`; `NextIntlClientProvider` with `{ prReview, shell }` messages; fixtures with real patches):
     - C1: response with `docs` and `boilerplate` empty → five level-3 headings in order Core, Tests, Wiring, Docs, Boilerplate; "0 files" in the empty ones.
     - C2/C3: within the core group header, "● 1", "2 files" and the "Collapse all" button follow the description in that order; a docs file starts collapsed (its lines absent), a small core file is open; clicking the core group's "Collapse all" hides its lines and the button turns "Expand all".
     - C4 "one toolbar, three controls": `within(getByRole('group', { name: 'Diff view' })).getAllByRole('button')` → names Smart order, Original order, Hide findings (N); "Original order" → no level-3 headings, file paths in `files` order; "Smart order" restores headings.
     - C5: core group with 1 file × 3 findings + 1 clean file → "● 1".
     - C7/C8/C16: a CRITICAL finding on a rendered RIGHT line shows its title, rationale, "Accept"/"Dismiss" under the line and `getByRole('img', { name: 'blocker' })` on the line; clicking "Dismiss" calls `mutate` with `{ findingId, action: "dismiss", prId: "pr1" }`; re-render with that finding's `dismissed_at` set → "● 1", the file dot and the blocker icon disappear while the card stays (muted); clicking the card title collapses it (rationale hidden), clicking again expands it.
     - C10: two agents with 5 + 3 findings → "Hide findings (8)" visible at start with cards and a GitHub comment thread visible; click → "Show findings (8)", cards and the thread body hidden.
     - C11: reviews `[]` → "Review not run yet — findings will appear here", no "new tokens" text, no "● " text, 5 headings still rendered.
     - C12 "tokens note sums the latest review's runs": two agents' latest reviews on runs with tokens 1000 + 200 and 700 + 100 (plus an older review of agent A on a 9000-token run) → "0 new tokens · built on 2,000 from last review"; no "Review not run yet" text.
     - C13: rerender with new `useSmartDiff`/`usePrReviews`/`usePrRuns` data (the post-invalidation refetch) → counters, cards and the tokens note update.
     - C14: `too_big: true, total_lines: 1200` → "This PR is large (1200 changed lines)"; `too_big: false` → absent.
  5. `styles.ts` for DiffTab notes/layout (CSS vars only).
- **RED check:** `DiffTab.test.tsx` C1 test fails before step 2 (no headings). Mutations (Edit tool, confirm with `git diff --stat`, then revert): initialise `showFindings` to `false` → C10 "visible at start" fails; compute tokens from ALL runs (`runs.data` sum) instead of `reviewTokens(latest, …)` → C12 fails ("built on 11,000"); render the tokens note even when `!hasReview` → C11 fails.
- **Acceptance criteria:**
  - [ ] C1–C5, C7, C8, C10–C14, C16 green in `DiffTab.test.tsx`; C17: no string literals in the new TSX (all via `t(...)` or props), css-vars guard green.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run DiffTab` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run` → all pass (full client suite incl. css-vars + smoke)

### T13 [W4] [backend] e2e flow: Smart Diff on the seeded PR
- **Status:** done
- **Files (only these):** `e2e/specs/10-smart-diff.flow.json`, `e2e/specs/README.md`, `e2e/README.md`
- **Depends on:** T11, T12
- **Produces:** flow `10-smart-diff` (seeded PR #482: 4 `src/*.ts` files with null patches → all core; seeded `kind:'review'` review with `agent_id` null, no `run_id` and no seeded `agent_runs` → tokens note "built on 0"; finding "Hardcoded Stripe secret key in commit" on `src/config.ts:12` → rendered in the out-of-patch block; server/src/db/seed.ts:125-180).
- **Insights:**
  - e2e/INSIGHTS.md 2026-11-04 "Text locators depend on strings owned by other packages … PR-tab labels 'Agent runs'/'Files changed' are hard-coded JSX … grep `e2e/specs/` for it" (PrDetailHeader.tsx:117).
  - e2e/INSIGHTS.md 2026-11-05 / 2026-11-07 CORRECTION "`wait --text` matches RENDERED text, so a label styled `text-transform: uppercase` … never matches" — wait on the group description / note / finding title, never on a section or group label.
  - e2e/INSIGHTS.md 2026-11-06 "`find … click` does NOT wait for a navigation started by the previous step … add `wait --url` + `wait --load networkidle`".
  - e2e/INSIGHTS.md 2026-11-06 "On Windows `npm run e2e:hermetic` dies instantly … run hermetic e2e in WSL/CI".
- **Skill focus:** security (flow reads seeded data only, never triggers a review).
- **Steps:** copy flow 05's first 7 steps (open `{BASE}/` → `wait --url /pulls` → click text "Add rate limiting to public API endpoints" → `wait --url /pulls/482` → `wait --load networkidle` → click button "Files changed" → `wait --url tab=diff`), then `wait --text "The substance of the change — review closely"`, `wait --text "0 new tokens · built on 0 from last review"`, `wait --text "Hardcoded Stripe secret key in commit"`, `find role button click --name "Original order"`, `wait --text "src/config.ts"`. Every step has a lowercase `label`. Add the flow row to `e2e/specs/README.md` and `e2e/README.md` (same table shape as row 05).
- **RED check:** not runnable on this Windows box (e2e/INSIGHTS.md 2026-11-06). In CI/WSL, against a build without T12 the flow fails at `wait --text "The substance of the change — review closely"`; record "not executed locally" in the task report.
- **Acceptance criteria:**
  - [ ] Flow file valid JSON, every step labelled, locators deterministic; README indexes updated; flow 05 untouched and still valid (its `src/config.ts` text still renders in Smart order).
- **Verify:**
  - `cd e2e && node -e "JSON.parse(require('fs').readFileSync('specs/10-smart-diff.flow.json','utf8'))"` → exit 0
  - `cd e2e && npm run e2e:hermetic` → all flows pass (CI / WSL only)

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T0, T1, T2, T3 | in parallel (disjoint files) | T0/T2/T3 Verify green; T1 test RED only on the missing `smart-diff/classify.js` / `constants.js` module; server tsc and client tsc 0 errors |
| W1 | T4, T5, T6, T7 | in parallel | every task's Verify (T1's test now green); server + client tsc 0 errors; `node scripts/check-architecture.mjs` clean |
| W2 | T8, T9, T10 | in parallel | every task's Verify; both packages typecheck; server unit suite (`--exclude '**/*.it.test.ts'`) + client full suite green |
| W3 | T11, T12 | in parallel | T11 `.it` file green (not skipped) + server unit suite; client full suite incl. css-vars + smoke |
| W4 | T13 | alone | e2e hermetic run in CI/WSL; then the user runs `/pr-self-review` and adds the vendor waiver |

## Risks · Review focus

- **Workspace scoping (T8, T11):** `forPull` must 404 via `reviewRepo.getPull(workspaceId, prId)` BEFORE `listFiles`/`reviewsForPull` (child tables have no workspace filter). Proven by the service test (no child read on 404) and S7.
- **Vendor contract (T0):** only the `SmartDiffRole` line changes, both copies byte-identical (`cmp`); nobody writes `waivers.json`; no other vendor file touched.
- **Latest-per-agent parity (T5 vs T9):** same rule on both sides — `kind 'review'` only, `agent_id` null is ONE bucket, newest `created_at` then id; counters/dots/"● N"/line icons use non-dismissed findings, cards include dismissed (muted); the C12 tokens sum uses the same latest-review set (matched by `run_id`). A mismatch shows server `finding_lines` and client cards disagreeing.
- **Cache invalidation (T3):** `["smart-diff", prId]` next to every `["reviews", prId]` invalidation, plus page `onRunDone` (uses `refetchReviews()`, not an invalidation — easy to miss) and multi-agent `useResultsData`; the tokens note depends on `["pr-runs", prId]`, which `onRunDone` already invalidates.
- **i18n + showcase (T2, T7, T12):** keys go under `smartDiff` (not `list` — duplicate `filesCount`); /showcase components take strings as props; group descriptions and the tokens note rendered as written (e2e waits on them); severity icons get translated accessible names (the kit's English `SEV` labels are not shown); css-vars guard green (no `--bg-elev`, `--text`, new tokens).
- **File order (T5, T9):** `pr_files` has no ordinal; the server returns DB order; the client orders each group by the PR detail `files` order — check `buildGroupViews` does it (Q5).

## Open questions

- **Q1** — RESOLVED: server spec S10 now says a malformed id → 422 `validation_error` (the app-wide handler, server/src/app.ts:115-123). T11 asserts 404 for an unknown uuid and 422 `validation_error` for a malformed id.
- **Q2** — RESOLVED — see Approved decisions (non-dismissed N, always "Hide findings (N)").
- **Q3** — RESOLVED — see Approved decisions (offset by measured `PrDetailHeader` height).
- **Q4** — RESOLVED — agreed: only cards, out-of-patch block and threads hide.
- **Q5** — RESOLVED — agreed: client re-orders by GitHub order, no migration.
- **Q6** — RESOLVED (verified by the main session): root `CLAUDE.md` is a git symlink to `AGENTS.md` (`git ls-files -s` mode 120000), so the vendor exception is already in both; nothing to sync.
