# Plan: Smart Diff (role-grouped Files changed tab with inline findings) · branch feat/smart-diff

Design-system task: no

Status: READY. No open question blocks hand-off; every default decision is listed
at the end of *Risks & open questions*.

Inputs: brief `.pipeline/feat-smart-diff/brief.md`; prototype screenshots
`~/Pictures/Screenshots/Screenshot from 2026-10-06 22-19-29.png` (expanded groups,
dot, line markers), `22-21-33.png` (collapsed groups, `● 2` counter, Smart/Original
toggle), `22-21-00.png` (inline finding comment). Where the prototype and the ACs
disagree (it puts a test file in Boilerplate, shows only three groups), the ACs win.

## Design in one paragraph

The server owns classification. A new module `server/src/modules/smart-diff/`
serves `GET /pulls/:id/smart-diff`: it reads the persisted `pr_files` and the
findings of the **latest review per agent** (`kind='review'`), classifies each
path with one regex table (`constants.ts`), and returns the `SmartDiff` contract
with all five groups in fixed order, per-file `finding_lines` (start lines of
non-dismissed findings) and two contract additions: `finding_ids` per file (the
findings the client should render inline, dismissed ones included so their
state stays visible) and `has_review` at the root (drives the "review not run
yet" empty state). No LLM, no GitHub call. The client fetches it with a new
`useSmartDiff` hook, joins each group's paths to `pr.files` (patch text), and
renders role groups of the existing `DiffViewer`; inline findings are a new,
prop-driven `DiffFindingApi` on the shared diff viewer (mirroring the existing
`DiffCommentApi`). "Original order" renders the plain `DiffViewer` over
`pr.files` (GitHub order), inline findings included. The client never classifies
a path.

## Goal & acceptance criteria

P1 (blocking)
- [ ] AC1 Files changed tab of an open PR shows the groups core → tests → wiring → docs → boilerplate, each with a role caption and a file count — verified by `DiffTab.test.tsx` (order + captions + counts from a mocked 5-group response), `smart-diff-helpers.test.ts` (fixed `ROLE_ORDER`, five groups always returned) and e2e flow 05 (seeded PR #482 has a file in every role after row 22).
- [ ] AC2 A lock file is classified `boilerplate`; docs and boilerplate groups start collapsed — verified by `smart-diff-helpers.test.ts` (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` → boilerplate) and `RoleGroup.test.tsx` (docs/boilerplate render no file cards until the header is clicked).
- [ ] AC3 After a review, the group header shows the number of files with findings (`● N`) — verified by `RoleGroup.test.tsx` and `smart-diff.it.test.ts` (finding_lines populated from the seeded-style review).
- [ ] AC4 A file card with findings shows a dot — verified by `DiffTab.test.tsx` (`aria-label` "Has findings" on the card header).
- [ ] AC5 In an expanded file, under the finding's line, an inline comment shows severity, title and explanation — verified by `findings.test.ts` (anchoring) + `DiffTab.test.tsx` + e2e flow 05 (`Hardcoded Stripe secret key in commit` under the seeded `src/config.ts` patch line 12).
- [ ] AC6 An "Original order" toggle restores GitHub order — verified by `DiffTab.test.tsx` (paths render in `pr.files` order after clicking) and e2e flow 05 (clicks `Original order`).
- [ ] AC7 An open PR with an implementation description and a demo video — verified manually; the PR body is drafted in §"PR description" below (user records and attaches the video).

P2
- [ ] AC8 Patterns and role order live in ONE constants file (`server/src/modules/smart-diff/constants.ts`); unit test over a "path → role" table including `package.json` → wiring, `src/**/__fixtures__/*.json` → tests, `src/**/*.md` → docs — verified by `server/test/smart-diff-helpers.test.ts`.
- [ ] AC9 The route response validates against `SmartDiff`; `SmartDiffRole` gains `tests` and `docs` in both copies of `brief.ts` — verified by `smart-diff-routes.test.ts` (`SmartDiff.parse(res.json())`), the route's `response: { 200: SmartDiffResponse }` schema, `contracts.test.ts`, and verify.sh's contract-drift precheck.
- [ ] AC10 Viewing Smart Diff makes no model call; grouping works before the first review — verified by `smart-diff.it.test.ts` (PR with files and no reviews → five groups, `has_review:false`; the overridden `MockLLMProvider` records zero calls; no `agent_runs` row created).
- [ ] AC11 A line with a finding has a coloured left stripe and a severity pill at the row's right edge — verified by `DiffTab.test.tsx` (pill text = severity label on the anchored line) and the e2e screenshot check by eye.
- [ ] AC12 Accept / Dismiss in the inline comment call the existing finding action and change the finding's state — verified by `FindingComment.test.tsx` (callback with `accept`/`dismiss`) and `DiffTab.test.tsx` (POST `/findings/:id/accept` hit on the mocked fetch; `reviews` and `smart-diff` queries invalidated).
- [ ] AC13 A finding whose line is not in the patch renders in a separate block at the end of the file — verified by `findings.test.ts` (unanchored bucket) and e2e flow 05 (`N+1 query in user list endpoint` on `src/api/users.ts`, which has no seeded patch).
- [ ] AC14 Finding comments are hidden by the same toggle as GitHub comments — verified by `DiffTab.test.tsx` (click "Hide comments" → finding title gone, file dot still present).
- [ ] AC15 PR description lists the subagents used and what plan-verifier checked — verified manually; draft in §"PR description".

P3
- [ ] AC16 Group header is sticky on scroll — verified by style assertion in `RoleGroup.test.tsx` (`position: sticky`) and by eye in the running app.
- [ ] AC17 A finding comment collapses to one line (close X) and re-expands — verified by `FindingComment.test.tsx`.
- [ ] AC18 Before the first review the group headers show "Review not run yet" instead of zero counters — verified by `RoleGroup.test.tsx` (`hasReview=false`).
- [ ] AC19 Counters and indicators update after Run review without reload — verified by `reviews-hooks` behaviour in `DiffTab.test.tsx` is impractical; instead `useRefreshOnRunsSettled` gets a hook test (`src/lib/hooks/reviews.test.ts`: running true→false invalidates `["reviews",id]` and `["smart-diff",id]`).
- [ ] AC20 Group names and captions come from `client/messages/en/prReview.json` → `smartDiff` — verified by every client test rendering through `NextIntlClientProvider` with the real messages file (a missing key throws in next-intl's test mode / shows the key path).

## Out of scope

- The prototype's "What this does" pseudocode summary and the `summary` chip: needs a model call. `pseudocode_summary` stays `null`.
- Rendering `split_suggestion` (the existing `largeTitle`/`largeBody` keys stay unused). The server fills it deterministically (see row 4).
- Ranking files inside a group by `file_rank` (repo-intel). Within a group files sort by non-dismissed finding count desc, then churn desc, then path. Wiring repo-intel in would need a container-injected structural port; left for later.
- Persisting the Smart/Original choice across reloads (component state, not `?order=`).
- Changing `FindingCard`, `FindingsPanel` or the Agent runs tab.
- Any change to `client/src/vendor/ui/` (segmented control is composed from two `Button`s locally).
- Re-seeding existing dev DBs (seed is idempotent and only fresh DBs get the new files; see risks).

## Relevant INSIGHTS

- `server/INSIGHTS.md:41` — `pr_files` is written only by `GET /pulls/:id` → the smart-diff route reads the persisted files, so the client must enable `useSmartDiff` only after `usePullDetail` resolved (it already does: `DiffTab` mounts after `pr` loaded, `page.tsx:114`) → rows 13, 15.
- `server/INSIGHTS.md:36` and `:30` — modules never import each other; `pulls/routes.ts` querying Drizzle directly is legacy, never a pattern → the new module has its own repository reading `pull_requests`/`pr_files`/`reviews`/`findings` through `db/schema`, and does not import `modules/reviews/**` or `modules/pulls/**` → rows 5–9.
- `server/INSIGHTS.md:20` — new contract names can collide (TS2308) → no new exported names are added; only fields on existing `SmartDiff`/`SmartDiffFile` and enum members → row 1.
- `server/INSIGHTS.md:40` — `db/seed.ts` is idempotent; extending PR #482's files only reaches fresh/hermetic DBs → row 11, e2e must run hermetic.
- `client/INSIGHTS.md:21` — no runtime values from `@devdigest/shared` in client code → `SmartDiffRole`, `Severity` order are mirrored as local constants with `import type` for the union → rows 16, 18.
- `client/INSIGHTS.md:34` — deep relative imports into `src/lib`/`src/components` are an ESLint error for new files; use `@/` → all client rows (do not copy `page.tsx`'s or `comments.ts`'s legacy relative imports).
- `client/INSIGHTS.md:35` — mutation errors are already toasted globally → the inline Accept/Dismiss must not render its own error alert → row 18.
- `client/INSIGHTS.md:43` — tests import `client/messages/en/prReview.json` by relative path; count `../` from the test's folder → rows 17–22 tests.
- `e2e/INSIGHTS.md:17` — flow 05 follows the home redirect; run it hermetic → verification.

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| Ring map (onion skill) | `modules/smart-diff/*` | `constants.ts`, `helpers.ts`, `service.ts` ring 2; `ports.ts` ring 1; `repository.ts` ring 3a; `routes.ts` ring 3b |
| `routes-no-persistence` | `smart-diff/routes.ts` | builds `new SmartDiffService({ repo: container.smartDiffRepo })`; no drizzle/db import |
| `drizzle-only-in-driven-ring`, `application-no-row-types` | repository → service | repository maps rows to the plain `SmartDiffInputs` DTO declared in `ports.ts` |
| `application-no-container`, `ports-are-pure` | service, ports | service takes `SmartDiffDeps`; ports import only `@devdigest/shared` types and same-module `constants.ts` |
| `no-cross-module` | smart-diff ↔ reviews/pulls | no imports from other modules; tables are read via `db/schema` in its own repository |
| `shared-is-a-leaf` | `vendor/shared/contracts/brief.ts` | only zod; no new imports |
| Every repository method takes `workspaceId` | `SmartDiffRepository.getInputs` | first filter is `pull_requests.workspace_id = workspaceId` |
| Validate once at the edge | route | `schema: { params: IdParams, response: { 200: SmartDiffResponse } }` (serializer compiler is set in `app.ts:65`) |
| No new lint:arch baseline entries | server | `pnpm lint:arch` must report 0 new violations |
| Contract copy | `client/src/vendor/shared/contracts/brief.ts` | copied verbatim from the server copy in row 2, never hand-edited |
| Client placement (react-frontend-architecture) | DiffTab subtree | route-private pieces under `DiffTab/_components/<Name>/` (2 levels max); finding rendering inside the cross-route diff viewer lives in `src/components/diff-viewer/`; data via `src/lib/hooks/reviews.ts` |
| Client import direction | diff-viewer | `src/components/diff-viewer` never imports from `src/app/**`; actions come in as callbacks on `DiffFindingApi` |
| No runtime import from `@devdigest/shared` | client | `import type` only; role list / severity order mirrored in local `constants.ts` |
| Do-not-touch | all | no lockfile, migration, `vendor/ui`, `.claude/skills` edits; no migration needed (no schema change) |

## Existing patterns to follow

- New server module trio + ports + container getter → copy the skills example (`.claude/skills/onion-architecture-backend/examples/good-module/`) and the intent wiring: port `server/src/modules/reviews/ports.ts:53`, repository class `server/src/modules/reviews/repository/intent.repo.ts:45`, container getter + override `server/src/platform/container.ts:70,133`, route composition `server/src/modules/reviews/routes.ts:26,146`.
- Workspace-scoped PR lookup → `server/src/modules/reviews/repository/pull.repo.ts:8`.
- Module registration → `server/src/modules/index.ts:26`.
- Route test without DB (fake repo via `ContainerOverrides`) → `server/test/skills-routes.test.ts:39`.
- DB-backed route test with mocked secrets/github/llm → `server/test/intent.it.test.ts:85`.
- Pure helper unit test → `server/test/pulls-helpers.test.ts`.
- Contract test → `server/test/contracts.test.ts:112`.
- Seeded PR data → `server/src/db/seed.ts:130`.
- Prop-driven diff-viewer extension (interface + pure helpers + partition into anchored/unanchored) → `client/src/components/diff-viewer/comments.ts:9,89` and its use in `FileCard.tsx:43` / `CodeLine.tsx:67`; unanchored block → `OutdatedComments`.
- Query hook + invalidation → `client/src/lib/hooks/reviews.ts:52,161`.
- Finding presentation (SeverityBadge, CategoryTag, ConfidenceNum, Markdown, Accept/Reject labels, accepted/rejected tags) → `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:55-113` (copy the look, do not import it: it is route-private and the diff viewer is cross-route).
- Component test with real messages + mocked fetch → `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.test.tsx`.
- Local mirror of a shared enum → `client/src/app/conventions/_components/CandidateCard/constants.ts`.
- e2e flow shape → `e2e/specs/05-pr-diff.flow.json`.

## Work breakdown (ordered)

| # | Package | Module / ring | File (new/edit) | Change | Skills to apply | Test |
|---|---|---|---|---|---|---|
| 1 | server | vendor/shared · 0 | `src/vendor/shared/contracts/brief.ts` (edit) | `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])` (declaration order = display order); `SmartDiffFile` + `finding_ids: z.array(z.string())`; `SmartDiff` + `has_review: z.boolean()`. Doc comments: `finding_lines` = sorted distinct `start_line` of non-dismissed findings; `finding_ids` = all findings of the latest review per agent for that path (dismissed included). No new exported names (grep done: only `brief.ts`/`review-api.ts` define SmartDiff*). | zod, typescript-expert | `contracts.test.ts` (row 3) |
| 2 | client | vendor/shared copy | `client/src/vendor/shared/contracts/brief.ts` (copy) | Copy the server file byte-for-byte (`cp`), no hand edits. | — (precheck drift) | verify.sh drift check |
| 3 | server | test | `test/contracts.test.ts` (edit) | Extend the SmartDiff case: add `finding_ids`, `has_review`, a `tests` and a `docs` group; assert an unknown role is rejected. | zod | itself |
| 4 | server | smart-diff · 2 | `src/modules/smart-diff/constants.ts` (new) | THE single classifier table: `ROLE_ORDER: readonly SmartDiffRole[]` = core, tests, wiring, docs, boilerplate; `ROLE_RULES` = ordered `{ role, patterns: RegExp[] }[]`, **first match wins, precedence boilerplate → tests → docs → wiring, default core**. Boilerplate: lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `*.lock`, `go.sum`, `Cargo.lock`), generated (`*.min.(js|css)`, `*.generated.*`, `*.snap`, `/(dist|build|vendor)/`, `db/migrations/meta/`, `*.map`). Tests: `/__tests__/`, `/__fixtures__/`, `/__mocks__/`, `*.test.*`, `*.spec.*`, `*.it.test.*`, top-level or nested `test/`, `tests/`, `e2e/`, `*.flow.json`. Docs: `*.md`, `*.mdx`, `*.rst`, `*.txt` under `docs/`, `/docs?/`, `LICENSE`, `CHANGELOG*`. Wiring: `package.json`, `tsconfig*.json`, `*.config.(js|cjs|mjs|ts)`, `.eslintrc*`, `Dockerfile`, `docker-compose*.yml`, `.github/`, `.env.example`, `(^|/)index\.(ts|tsx|js)$`, `(^|/)(server|app|main|config|routes|container)\.(ts|js)$`, root-level `*.json|*.ya?ml|*.toml`. Patterns are anchored, no nested quantifiers (ReDoS-safe), matched against the POSIX path lower-cased. `SPLIT_THRESHOLD_LINES = 400` (same as the PR-list "L" bucket, `client/specs/pages.md:71`). | onion-architecture-backend, security | row 10 |
| 5 | server | smart-diff · 2 | `src/modules/smart-diff/helpers.ts` (new) | Pure: `classifyPath(path): SmartDiffRole`; `buildSmartDiff(inputs: SmartDiffInputs): SmartDiff` → always five groups in `ROLE_ORDER` (empty `files: []` allowed); per file `finding_lines` (distinct sorted start lines, non-dismissed), `finding_ids` (all), `pseudocode_summary: null`; file order inside a group: non-dismissed finding count desc, churn desc, path asc. `split_suggestion`: `total_lines` = Σ(additions+deletions); `too_big = total_lines > SPLIT_THRESHOLD_LINES`; `proposed_splits` = when too_big, one `{ name: role, files }` per non-empty group except boilerplate, else `[]`. `has_review` passed through. Findings whose `file` matches no PR file are ignored. | onion-architecture-backend, typescript-expert | row 10 |
| 6 | server | smart-diff · 1 | `src/modules/smart-diff/ports.ts` (new) | `SmartDiffSourceFile {path, additions, deletions}`, `SmartDiffFindingRef {id, file, startLine, dismissed}`, `SmartDiffInputs {files, findings, hasReview}`, `SmartDiffRepositoryPort { getInputs(workspaceId, prId): Promise<SmartDiffInputs \| undefined> }` (undefined = PR not in workspace), `SmartDiffDeps { repo }`. | onion-architecture-backend | — (types) |
| 7 | server | smart-diff · 3a | `src/modules/smart-diff/repository.ts` (new) | `SmartDiffRepository implements SmartDiffRepositoryPort`, ctor `(db: Db)`. `getInputs`: PR by `(workspace_id, id)` → undefined if absent; `pr_files` by `pr_id`; latest review per agent: `db.selectDistinctOn([t.reviews.agentId], …).where(pr_id = prId and kind = 'review').orderBy(t.reviews.agentId, desc(t.reviews.createdAt))` (Postgres `DISTINCT ON` treats NULL agent ids — the seeded review — as one group); findings `inArray(reviewId, ids)` (skip when ids empty); `hasReview = ids.length > 0`; `dismissed = dismissedAt != null`. Rows mapped to port DTOs. | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend, security | row 12 |
| 8 | server | smart-diff · 2 | `src/modules/smart-diff/service.ts` (new) | `SmartDiffService(deps)`; `get(workspaceId, prId)`: `repo.getInputs` → `NotFoundError('Pull request not found')` when undefined → `buildSmartDiff`. | onion-architecture-backend | rows 10, 11b |
| 9 | server | smart-diff · 3b | `src/modules/smart-diff/routes.ts` (new) | Default Fastify plugin; `GET /pulls/:id/smart-diff`, `schema: { params: IdParams, response: { 200: SmartDiffResponse } }`, `getContext` first, returns `service.get(workspaceId, req.params.id)`. Header comment lists the route. Global rate limit applies (read-only, no fan-out). | fastify-best-practices, onion-architecture-backend, security | row 11b |
| 9a | server | root | `src/platform/container.ts` (edit) | `smartDiffRepo?: SmartDiffRepositoryPort` in `ContainerOverrides`; lazy `get smartDiffRepo(): SmartDiffRepositoryPort` like `intentRepo` (`container.ts:133`). | onion-architecture-backend | row 11b |
| 9b | server | 3b registry | `src/modules/index.ts` (edit) | Import `smartDiff from './smart-diff/routes.js'`, add `smartDiff` to `modules`. | fastify-best-practices, onion-architecture-backend | row 11b |
| 10 | server | test | `test/smart-diff-helpers.test.ts` (new) | `it.each` table path → role, ≥ 25 rows covering every rule, plus the three contested cases: `package.json` → wiring, `src/foo/__fixtures__/user.json` → tests, `src/middleware/README.md` → docs; also `package-lock.json`/`pnpm-lock.yaml` → boilerplate, `src/middleware/ratelimit.ts` → core, `src/config.ts` → wiring, `test/ratelimit.test.ts` → tests. `buildSmartDiff`: five groups in order even when empty; finding_lines dedupe/sort; dismissed excluded from finding_lines but present in finding_ids; split suggestion below/above threshold; `has_review` passthrough. | typescript-expert | itself |
| 11b | server | test | `test/smart-diff-routes.test.ts` (new) | No DB: `buildApp({ config, overrides: { auth: new MockAuthProvider(), smartDiffRepo: fake } })` (copy `skills-routes.test.ts:39`); 200 body passes `SmartDiff.parse`; fake returning undefined → 404 envelope; invalid id → 400. | fastify-best-practices | itself |
| 11 | server | db seed · 3a | `src/db/seed.ts` (edit) | Inside the existing `if (!pr)` block (`seed.ts:130`) add five `pr_files` so PR #482 has 9 files (matches `filesCount: 9`) and every role: `src/server.ts` (+8 −1, wiring), `package.json` (+3 −1, wiring), `package-lock.json` (+92 −24, boilerplate), `test/ratelimit.test.ts` (+6 −0, tests), `docs/rate-limiting.md` (+12 −4, docs). Give `src/config.ts` a small `patch` (hunk `@@ -9,6 +9,10 @@`, new line 12 = `stripeKey: "STRIPE_KEY_PLACEHOLDER",`) so the seeded CRITICAL finding anchors inline; leave `src/api/users.ts` without a patch (exercises the unanchored block). Totals stay +247 −38. Do not touch the intent row (its `files` source text is static). | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend, security | row 12, e2e row 25 |
| 12 | server | test | `test/smart-diff.it.test.ts` (new) | Postgres (`test/helpers/pg.ts`), `buildApp` with `MockSecretsProvider`, `MockGitHubClient`, `llm.openrouter: MockLLMProvider` (per `server/INSIGHTS.md` 2026-10-06 note). Cases: PR with files and no reviews → 5 groups, `has_review:false`, empty finding_lines, mock LLM call count 0, no `agent_runs` rows (AC10); two reviews from the same agent → only the newer one's findings; reviews from two agents → both; a NULL-agent review counted once; dismissed finding excluded from `finding_lines`, kept in `finding_ids`; PR in another workspace → 404. Every body passes `SmartDiff.parse`. | drizzle-orm-patterns | itself |
| 13 | client | lib/hooks | `src/lib/hooks/reviews.ts` (edit) | `useSmartDiff(prId)` → `["smart-diff", prId]`, `api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`)`, `enabled: !!prId`. Add `["smart-diff", prId]` invalidation to `useFindingAction`, `useDeleteReview`, `useDeleteRun`, `useRunReview`. New `useRefreshOnRunsSettled(prId, running: boolean)`: `useRef` of the previous value; on true→false invalidate `["reviews", prId]` and `["smart-diff", prId]` (AC19; works on any tab, unlike `FindingsTab`'s `onRunDone`). `import type` only. | react-frontend-architecture, typescript-expert | row 14 |
| 14 | client | lib/hooks test | `src/lib/hooks/reviews.test.ts` (new) | `renderHook` with a `QueryClient` spy: rerender running true→false calls `invalidateQueries` for both keys; false→false does nothing. | react-testing-library | itself |
| 15 | client | page | `src/app/repos/[repoId]/pulls/[number]/page.tsx` (edit) | One line: `useRefreshOnRunsSettled(prId, reviewRunning)` imported from `@/lib/hooks/reviews` (do not add new deep relative imports). No other change; `DiffTab` props unchanged. | react-frontend-architecture, react-best-practices, next-best-practices | via row 14 |
| 16 | client | diff-viewer (cross-route) | `src/components/diff-viewer/findings.ts` (new) | Mirror of `comments.ts`. `export interface DiffFindingApi { findings: FindingRecord[]; show: boolean; pendingId: string \| null; onAction(findingId: string, action: FindingActionKind): void }`. Pure helpers: `findingsForPath`, `hasOpenFindings(findings)` (any non-dismissed), `strongestSeverity` (order from local `SEVERITY_RANK` in `constants.ts`, CRITICAL > WARNING > SUGGESTION > INFO), `anchorFindings(findings, lines: Line[])` → `{ stripe: Map<lineIndex, Severity>, pill: Map<lineIndex, Severity>, after: Map<lineIndex, FindingRecord[]>, unanchored: FindingRecord[] }`. Anchoring: RIGHT side only (`newNo` on add/ctx lines); stripe on every rendered line in `[start_line, end_line]`; pill on the first rendered line of the range; comment after the last rendered line of the range; no rendered line in range → `unanchored`. | react-frontend-architecture, typescript-expert | row 17 |
| 16a | client | diff-viewer | `src/components/diff-viewer/constants.ts` (edit) | Add `SEVERITY_RANK` (local mirror, `satisfies Record<Severity, number>` with `import type`). | react-frontend-architecture | row 17 |
| 17 | client | diff-viewer test | `src/components/diff-viewer/findings.test.ts` (new) | Parsed sample patch: single-line finding anchors with pill + comment; multi-line range partly in patch anchors to rendered lines; out-of-patch and null-patch findings → `unanchored`; strongest severity wins on overlap; dismissed still anchored. | react-testing-library | itself |
| 18 | client | diff-viewer | `src/components/diff-viewer/FindingComment/FindingComment.tsx` + `index.ts` + `styles.ts` (new) | Prototype `22-21-00.png`: card with left stripe in `SEV[sev].c`, `SeverityBadge` + bold title + `CategoryTag`, meta `line {n} · {pct}% conf` (`ConfidenceNum`), `Markdown` rationale, "SUGGESTED FIX" box (`finding.suggestedFix`) with `Markdown` suggestion, Accept / Reject `Button`s (`finding.accept`/`finding.dismiss`, `active` from `accepted_at`/`dismissed_at`, `disabled` while `pendingId === f.id`), accepted/rejected tags, close `IconBtn` (aria-label `smartDiff.collapseFinding`) that collapses to a one-line row (severity + title + line), click row to expand. `useTranslations("prReview")`. No own error UI (global toast). Rendered with `variant="unanchored"` inside the end-of-file block too. | react-frontend-architecture, react-best-practices, next-best-practices, security | row 19 |
| 19 | client | diff-viewer test | `src/components/diff-viewer/FindingComment/FindingComment.test.tsx` (new) | Renders severity/title/rationale/suggestion; Accept and Reject call `onAction` with `accept`/`dismiss`; X collapses to one line and click re-expands (AC17); dismissed shows "rejected". | react-testing-library | itself |
| 20 | client | diff-viewer | `src/components/diff-viewer/FileCard/FileCard.tsx` (edit) | New optional props `findings?: DiffFindingApi`, `defaultOpen?: boolean` (falls back to the churn rule). Header: red dot (`aria-label` `smartDiff.hasFindings`) when `hasOpenFindings` for the path, independent of `show`. Body: `anchorFindings` once per file (`useMemo`), pass stripe/pill/after to `CodeLine`; after the lines (also when `lines.length === 0`) render an "Not in the diff" block (`smartDiff.unanchoredTitle`) with `FindingComment`s when `show` and `unanchored.length > 0`. | react-frontend-architecture, react-best-practices, next-best-practices | rows 17, 23 |
| 20a | client | diff-viewer | `src/components/diff-viewer/CodeLine/CodeLine.tsx` (edit) | Optional props `stripe?: Severity`, `pill?: Severity`, `findingsAfter?: FindingRecord[]`, `findingApi?: DiffFindingApi`. When `findingApi.show`: 3 px inset left stripe in `SEV[stripe].c`, a right-aligned outlined pill (`SEV[pill].icon` + lower-case label) and `FindingComment`s after the row (under any GitHub threads). | react-frontend-architecture, react-best-practices, next-best-practices | row 23 |
| 20b | client | diff-viewer | `src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `styles.ts`, `index.ts` (edit) | `DiffViewer` passes an optional `findings?: DiffFindingApi` and `defaultOpen?: boolean` to every `FileCard`; key by `f.path` instead of index. `styles.ts`: stripe/pill/dot/unanchored-block styles (CSS variables only). `index.ts`: `export type { DiffFindingApi } from "./findings"`. | react-frontend-architecture, react-best-practices, next-best-practices | row 23 |
| 21 | client | DiffTab | `.../[number]/_components/DiffTab/DiffTab.tsx` (edit) + `styles.ts`, `helpers.ts`, `constants.ts` (new) | Composer. Data: `useSmartDiff(prId)`, `usePrReviews(prId)` (deduped with the page), `useFindingAction()`, existing `usePrComments`/`useCreatePrComment`. State: `order: "smart" \| "original"` (`useState("smart")`), `showComments` **default `true`** (one toggle for GitHub comments and findings, AC14). Toolbar per prototype: `REVIEWER-ORDERED DIFF` label, `N files · +a −d`, `OrderToggle`, and the Show/Hide comments button shown when comments + displayed findings > 0 (labels moved to i18n). `helpers.ts`: `displayedFindings(smartDiff, reviews)` = findings whose id is in any `finding_ids` (single source of the selection); `joinGroupFiles(group, prFiles)` → `PrFile[]` (patch from `pr.files` by path; a path missing from `pr.files` gets `patch: null`). Smart order: one `RoleGroup` per group with `files.length > 0`, in server order. Original order: `<DiffViewer files={files} findings={…} commenting={…} />`. While `useSmartDiff` loads or errors, fall back to Original order rendering (no blank tab). `onAction` → `findingAction.mutate({ findingId, action, prId })`. | react-frontend-architecture, react-best-practices, next-best-practices | row 23 |
| 21a | client | DiffTab/_components | `.../DiffTab/_components/OrderToggle/OrderToggle.tsx` + `index.ts` + `styles.ts` (new) | Segmented pair of `Button size="sm"` in a bordered wrapper, `role="group"` + `aria-pressed`; labels `smartDiff.smartOrder` / `smartDiff.originalOrder`. | react-frontend-architecture, react-best-practices, next-best-practices | row 23 |
| 21b | client | DiffTab/_components | `.../DiffTab/_components/RoleGroup/RoleGroup.tsx` + `index.ts` + `styles.ts` + `constants.ts` (new) | Props: `role`, `files: PrFile[]`, `filesWithFindings: number`, `hasReview`, `findings`, `commenting`. Header (button, `aria-expanded`): chevron, coloured square, `smartDiff.<role>Label`, muted `smartDiff.<role>Caption`, right side `● N` (`smartDiff.filesWithFindings`, `var(--crit)`) only when `N > 0`, or `smartDiff.reviewNotRun` when `!hasReview` (AC18), then `smartDiff.filesCount`. Header `position: sticky; top: 0; z-index: 2; background: var(--bg…)` (AC16). Collapsed state `useState(DEFAULT_COLLAPSED.has(role))`. Body: `<DiffViewer files findings commenting />`. `constants.ts`: `ROLE_META: Record<SmartDiffRole, { labelKey, captionKey, color }>` (`import type`; colors core `var(--accent)`, tests `var(--ok)`, wiring `var(--warn)`, docs `var(--info)`, boilerplate `var(--text-muted)`), `DEFAULT_COLLAPSED = new Set(["docs","boilerplate"])`. Presentation only; classification stays on the server. | react-frontend-architecture, react-best-practices, next-best-practices | row 22 |
| 22 | client | test | `.../DiffTab/_components/RoleGroup/RoleGroup.test.tsx` (new) | Caption + count from real messages; docs/boilerplate start collapsed and expand on click, core starts expanded; `● 2` when 2 files have findings; "Review not run yet" when `hasReview=false`; header style `position: sticky`. | react-testing-library | itself |
| 23 | client | test | `.../DiffTab/DiffTab.test.tsx` + `helpers.test.ts` (new) | Mocked fetch for `/pulls/:id/smart-diff`, `/pulls/:id/reviews`, `/pulls/:id/comments`, `POST /findings/:id/accept`. Asserts: five group labels in order; dot on a file with findings; inline title/rationale + severity pill on the anchored line; Hide comments hides findings and pills but not the dot; Original order lists paths in `pr.files` order; Accept posts to `/findings/<id>/accept`. `helpers.test.ts`: `displayedFindings`, `joinGroupFiles`. Copy setup from `IntentCard.test.tsx`. | react-testing-library | itself |
| 24 | client | messages | `client/messages/en/prReview.json` (edit) | Under `smartDiff`: change `coreLabel` → "Core logic"; add `testsLabel` "Tests", `docsLabel` "Docs", `coreCaption` "The substance of the change — review closely", `testsCaption` "Proves the change works", `wiringCaption` "Hooks the core into the app", `docsCaption` "Explains the change — skim", `boilerplateCaption` "Generated / mechanical — skim", `title` "Reviewer-ordered diff", `summary` "{count} files", `smartOrder` "Smart order", `originalOrder` "Original order", `showComments` "Show comments ({count})", `hideComments` "Hide comments ({count})", `filesWithFindings` "{count, plural, one {# file with findings} other {# files with findings}}" (visually `● N`, used as aria-label), `reviewNotRun` "Review not run yet", `hasFindings` "Has findings", `unanchoredTitle` "Findings outside the diff", `collapseFinding` "Collapse finding", `lineConfidence` "line {line} · {pct}% conf". Keep existing keys. | — | rows 19, 22, 23 |
| 25 | e2e | flow | `e2e/specs/05-pr-diff.flow.json` (edit) | After `wait --text src/config.ts` add: `wait --text "Smart order"`; `wait --text` for `Core logic`, `Tests`, `Wiring`, `Docs`, `Boilerplate`; `wait --text "Hardcoded Stripe secret key in commit"` (inline, wiring group open, `src/config.ts` auto-open); `wait --text "N+1 query in user list endpoint"` (unanchored block, core group open); `find role button click --name "Original order"`; `wait --text "src/config.ts"`. No Accept/Reject click (flows must not write). Update `description`. | — | itself (hermetic) |
| 26 | e2e | docs | `e2e/specs/flows.md` + `e2e/README.md` (edit) | Seeded facts: PR files now nine (list them), `src/config.ts` has a patch; 05 section: new journey, locators, "breaks if". README coverage row for 05. | — | — |
| 27 | client | docs | `client/specs/pages.md` (edit) | Tab `diff` section: Smart/Original order, role groups, default-collapsed roles, one comments toggle now **visible by default**, inline findings and their actions, `useSmartDiff`, `useRefreshOnRunsSettled`; PR detail data list gains `GET /pulls/:id/smart-diff`. | — | — |
| 28 | server | docs | `server/specs/smart-diff.md` (new) + `server/README.md` API map (edit) | Route, classifier precedence and contested cases, latest-review-per-agent rule, `finding_lines` vs `finding_ids`, split-suggestion rule, no model call. | — | — |

## Contracts & migrations

- Contract changes (`server/src/vendor/shared/contracts/brief.ts`): `SmartDiffRole` + `tests`, `docs`; `SmartDiffFile.finding_ids`; `SmartDiff.has_review`. No new exported names. Copy to `client/src/vendor/shared/contracts/brief.ts` in row 2. `review-api.ts` `SmartDiffResponse = SmartDiff` already exists, unchanged.
- Migration: none (no schema change; seed only).

## Verification plan

| Package | Commands | Needs Docker |
|---|---|---|
| all touched | `bash .claude/skills/pr-self-review/scripts/verify.sh run --with-it --e2e` (final gate; `--with-it` for row 12 + seed, `--e2e` for row 25) | yes |
| server | `pnpm exec vitest run smart-diff-helpers contracts smart-diff-routes` while building rows 3–11b | no |
| server | `pnpm exec vitest run smart-diff.it.test` while building rows 7, 11, 12 | yes |
| server | `pnpm lint:arch` after row 9b (0 new violations) | no |
| client | `pnpm exec vitest run findings FindingComment RoleGroup DiffTab reviews` while building rows 13–24 | no |
| e2e | `npm run e2e:hermetic` for flow 05 (never against the dev DB) | yes |

Manual check for AC11/AC16 and the demo video: `./scripts/dev.sh`, open PR #482 → Files changed (dev DB keeps the old 4 seeded files; see risks).

## PR description (AC7, AC15) — draft for the user

Sections: **What** (Smart Diff: five role groups, deterministic classifier on the server, inline findings with Accept/Reject, Original order, one comments toggle, sticky headers, empty state; no model call); **How** (route `GET /pulls/:id/smart-diff`, latest review per agent, `finding_ids` / `has_review` contract additions, classifier table in `server/src/modules/smart-diff/constants.ts`); **Decisions** (copy the "Decisions taken by default" list below); **Tests** (unit, IT, e2e flow 05 extended, verify.sh result); **Demo** (video placeholder — user records and attaches); **Agent pipeline**: subagents used — `researcher` (brief `.pipeline/feat-smart-diff/brief.md`), `planner` (this plan), `plan-verifier` (fill in what it checked: AC coverage per row, every file a row, do-not-touch paths, contract copy step, lint:arch/onion placement, verification level), `implementer`, architecture and security reviewers, `pr-self-review` verdict. The implementer fills in the actual verifier findings from its report.

## Risks & open questions

None block hand-off.

- **Seed only reaches fresh DBs** (`server/INSIGHTS.md:40`): the dev DB keeps 4 files for PR #482 and no patch on `src/config.ts`, so locally only core + wiring show. e2e is hermetic, so flow 05 is unaffected. Implementer may patch the dev rows by hand for the demo; never `docker compose down -v`.
- **Fake secret in the seed patch**: the literal is `STRIPE_KEY_PLACEHOLDER` (user decision 2026-10-06); never use an `sk_live_` prefix. Re-run the precheck secret scan.
- **Race with `GET /pulls/:id`**: that route deletes and re-inserts `pr_files` without a transaction (`pulls/routes.ts:240`). `DiffTab` mounts only after the detail resolved, so `useSmartDiff` runs afterwards; a path missing from the response simply is not grouped until the next refetch. Not fixed here (pulls routes are legacy, out of scope).
- **Sticky offset**: the AppShell scroll container decides what `top: 0` sticks to; verify in the browser and adjust `top` in `RoleGroup/styles.ts` only.
- **Stale line numbers**: findings of an older head SHA may not match the current patch; they fall into the unanchored block (AC13), not dropped.
- **"Show comments" default flips to visible** (prototype shows inline findings): `client/specs/pages.md` "Comments start hidden" is updated in row 27; GitHub comments become visible by default too, since AC14 requires one toggle.
- **Markdown in finding text** is LLM output: render only through `@devdigest/ui` `Markdown` (as `FindingCard` does), never `dangerouslySetInnerHTML`.

Decisions taken by default:
1. Server/client split: server classifies, groups, orders and computes `finding_lines`; client never classifies (only role → label/colour/default-collapsed presentation).
2. "Latest review" = newest `kind='review'` review per agent (NULL agent counts as one).
3. Contract gains `finding_ids` (per file) and `has_review` (root) so the client renders exactly the server's selection and the empty state from the same response.
4. Dismissed findings: excluded from dots/counters/`finding_lines`, still rendered inline with the "rejected" tag (consistent with `FindingCard`).
5. Server always returns five groups; client hides empty ones (prototype shows only non-empty groups); the seed gives PR #482 all five.
6. `split_suggestion` filled deterministically (400-line threshold, one split per non-boilerplate role), not rendered.
7. Within-group order: open finding count, churn, path (no repo-intel rank).
8. Order toggle is component state; comments toggle covers GitHub comments and findings, default visible.
9. Original order also shows inline findings.

## Handoff to reviewers

- Architecture review focus: `server/src/modules/smart-diff/*` ring placement (no imports from `modules/reviews`/`pulls`, no row types in `ports.ts`/`service.ts`), `container.ts` getter + override, `pnpm lint:arch` delta = 0; client: `src/components/diff-viewer` stays route-agnostic (no `src/app` import, actions via `DiffFindingApi`), `DiffTab/_components` depth ≤ 2, no runtime import from `@devdigest/shared`, no new deep relative imports, contract copy byte-identical.
- Security review focus: route is workspace-scoped (`getInputs` filters `workspace_id`; foreign PR → 404, IT-tested); regexes in `constants.ts` are constant and linear (paths come from GitHub); finding `rationale`/`suggestion`/`title` and file paths are untrusted LLM/GitHub text rendered via React text and `Markdown` only; seeded fake secret literal; no new external calls, no secrets touched.
