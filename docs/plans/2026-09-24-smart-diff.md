# Development Plan: Smart Diff (L03, second half)
Packages: server, client (+ both shared copies), e2e flow · Base: feat/lab3@b12637e · Spec: S0 → `{server,client}/specs/06-smart-diff.md`
Context pack: docs/plans/2026-09-24-smart-diff.context.md

## Goal
Files changed groups files by role (core, tests, wiring, docs, boilerplate; last two collapsed). The latest review shows as a group ● count, a file dot and an inline FindingCard under `RIGHT:start_line`. Smart/Original toggle. No model call.

## Out of scope
- Criteria 7, 15 (lead); Agent runs tab; pseudocode_summary, real split_suggestion, large-PR banner, L08 pre-filter.

## Decisions
- New module `server/src/modules/smart-diff/`, mirroring `modules/intent`. It owns its reads [F5]. `index.ts` exports `classifyFile` [I2].
- Globs are gitignore-like: no `/` = basename, `/` = anchored at root, `**/` = any depth. First match wins in order boilerplate, tests, wiring, docs; else core.
- Latest review = newest `reviews` row (`desc(createdAt)`) [F3]. `finding_lines` = unique ascending `start_line`s of ALL its findings (dismissed too).
- The server returns all 5 groups, each sorted by path. The client hides empty groups.
- The group ● and the file dot come from `finding_lines`. The cards come from `usePrReviews(prId)[0]`.
- DiffViewer gets a `findings` slot API, and DiffTab supplies the card [F15].
- One toggle hides GitHub comments, finding cards and the unmatched block; default derived (on if the latest review has findings) [F7]. Stripe + label always stay.
- The order goes in the URL as `?order=original` [C10].

## Steps
### S0 — Specs [docs]
- Files: A `server/specs/06-smart-diff.md`, A `client/specs/06-smart-diff.md`
- Change: Goal, Out of scope and `ACn [Bx]` only. Server: B2, B8, B9, B10, 404. Client: B1–6, B11–14, B16–20.
- Done when: both exist.

### S1 — Contract [shared]
- Files: M `server/src/vendor/shared/contracts/brief.ts` (+ client copy), `server/test/contracts.test.ts`
- Change: `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])`.
- Tests: SmartDiff parses `tests` and `docs`.
- Done when: `./scripts/check-shared-drift.sh` and `./scripts/gates.sh` are green.

### S2 — Classifier, test first [server]
- Files: A `server/test/smart-diff-classify.test.ts`. In `modules/smart-diff/`: A `domain/constants.ts` (`SMART_DIFF_ROLE_ORDER`, `ROLE_CHECK_ORDER`, `ROLE_PATTERNS`), A `domain/classify.ts` (`classifyFile(path): SmartDiffRole`, regexes compiled once), A `index.ts`.
- Rules: pure domain (onion §1); [I5]; normalise `./` and `\`; escape metacharacters, no nested quantifiers.
- Tests: table, ≥2 paths per family + the 3 contested cases with reasons; also `src/config.ts`→core, `src/api/index.ts`→wiring, `client/dist/x.js`→core.
- Done when: table green; `pnpm arch:check` clean.

### S3 — Build + use case [server]
- Files: A `domain/smart-diff.ts` (`buildSmartDiff(files, findings)`); A `application/ports.ts` (`SmartDiffSource`: `pullExists`, `listFiles`, `latestReviewFindings`); A `application/smart-diff-service.ts` (`get(workspaceId, prId)`)
- Change: groups follow `SMART_DIFF_ROLE_ORDER`. `split_suggestion` is `{too_big:false, total_lines: sum(additions+deletions), proposed_splits:[]}`. No PR → `NotFoundError`.
- Rules: [I4]; ports, not the Container (onion §4).
- Tests: A `test/smart-diff-build.test.ts`: order, empty groups, line dedupe and sort, a foreign-path finding is ignored, total_lines. A `test/smart-diff-service.test.ts` (fakes): 404, and a PR with no review.
- Done when: `./scripts/gates.sh` is green.

### S4 — Repository, route, wiring [server]
- Files: A `infrastructure/repository.ts` (scoped to the workspace; newest review with `limit 1`); A `http/routes.ts` (`GET /pulls/:id/smart-diff`, `IdParams`, response `SmartDiffResponse`); A `http/schemas.ts` (re-exports the `SmartDiffResponse` contract for the route); A `composition.ts`; M `modules/index.ts`, `modules/composition.ts`
- Rules: [I1] [I3]. The handler only calls `getContext` then the service.
- Tests: A `test/smart-diff.it.test.ts` (mirror). Fixture: a lockfile, a test, a README, `index.ts` and core, with an older and a newer review. Assert: newer review's lines only, contract parses, no review → `[]`, unknown id → 404, 0 LLM calls [I6].
- Done when: `./scripts/gates.sh --integration` is green.

### S5 — Client data + copy [client]
- Files: M `src/lib/hooks/keys.ts` (`prKeys.smartDiff`, add `"smart-diff"` to `RUN_SCOPED_PR_KEYS`); A `hooks/smart-diff.ts` (`useSmartDiff`) + `index.ts`; M `reviews.ts`, `reviews.test.tsx`; M `messages/en/prReview.json`
- Change: invalidate smartDiff in `invalidateRunScoped`, `useFindingAction`, `useDeleteRun`, `useDeleteReview`. Add `useLiveRunRefresh(prId)`, which calls `useRunEvents` with the active-run ids [F11] [C4]. New `smartDiff.*` keys [C3]: `testsLabel`, `docsLabel`, `<role>Hint`, `heading`, `summary`, `smartOrder`, `originalOrder`, `severity.{critical,warning,suggestion}` = blocker/warning/suggestion, `filesWithFindings`, `unmatchedTitle`, `noReview`.
- Tests: the mutations and an SSE finish refetch smart-diff [C5].
- Done when: `./scripts/gates.sh` is green.

### S6 — diff-viewer findings slot [client]
- Files: in `src/components/diff-viewer/`: A `findings.ts` (`DiffFindingApi {items, flagged, show, renderCard}`, `partitionFindings` keyed `RIGHT:${start_line}`, `topSeverity`); A `UnmatchedFindings/`; M `CodeLine/`, `FileCard/`, `DiffViewer/`, `index.ts`, `styles.ts`, `constants.ts` (`SEVERITY_LABEL_KEY`); M `messages/en/shell.json` (`diffViewer.severity.*`, `diffViewer.unmatchedTitle`, `diffViewer.hasFindings` — the component owns this copy under its existing namespace)
- Change: CodeLine: stripe + right label from `SEV[sev]`; cards when `show`. FileCard: dot (aria-label) beside the path, not the MessageSquare counter; unmatched block at the end.
- Rules: no new palette; [C6]; `renderCard` returns a component element.
- Tests: A `findings.test.ts`, A `DiffViewer/DiffViewer.test.tsx`: card under the line, "blocker" label, a deleted-line finding → unmatched, `show=false` keeps the label, dot [C1].
- Done when: `./scripts/gates.sh` is green.

### S7 — Order in the URL [client]
- Files: M in `PrDetailView/`: `constants.ts` (`ORDER_PARAM`), `helpers.ts` (`parseOrder`) + test, `usePrDetailSearch.ts`, `PrDetailView.tsx` (passes `order`/`setOrder` to DiffTab)
- Done when: the `parseOrder` tests and `PrDetailView.test.tsx` are green.

### S8 — Smart Diff in DiffTab [client]
- Files: in `DiffTab/`: A `helpers.ts` + test (`groupFiles`: non-empty groups, PrFile by path, leftovers → core; `flaggedCount`; `totals`); A `constants.ts` (`DEFAULT_COLLAPSED_ROLES`, key and CSS var per role); A `_components/RoleGroup/` (sticky header: label, hint, `● N` if N>0, "N files"; body `<DiffViewer>`); A `_components/InlineFindingCard/` (FindingCard `defaultExpanded` + `useFindingAction`); A `_components/OrderToggle/` (2 `Button active`); M `DiffTab.tsx`; A `DiffTab.test.tsx`, `styles.ts`
- Change: header = heading, summary, comments toggle, OrderToggle. Original order = one DiffViewer. No reviews → `noReview` notice, no counters. Calls `useLiveRunRefresh`.
- Rules: ≤200 lines/component, logic in helpers; [C1] [C2] [C11].
- Tests: group order; lockfile → boilerplate; docs and boilerplate collapsed; the ● count; Accept POSTs; the toggle hides cards; Original order; empty state.
- Done when: `./scripts/gates.sh` green; client suite run alone [C9].

### S9 — e2e + docs
- Files: A `e2e/flows/12-smart-diff.flow.json` (PR #482 → Files changed → group label + ● → Original order → `order=original` [E1]); M `e2e/README.md`, `server/README.md` (module map + routes), `docs/review-flow.md`
- Done when: `./scripts/e2e.sh` is green (flow 05 too).

## Contracts & migrations
- S1 only (server copy → `cp -r server/src/vendor/shared/. client/src/vendor/shared/` → drift check). No migration.

## Verification
- `./scripts/gates.sh --integration`, then `./scripts/e2e.sh`. Manual, mock LLM [I8]: Run review on #482, return to Files changed mid-run → counters update without reload.

## Open questions / assumptions
- "Run all" makes one review per agent — default: newest row only (literal brief).
- Hide empty groups — default: yes (prototype).
- The derived toggle default also shows GitHub comments once findings exist — default: accept.
- Keep `coreLabel` "Core", not "Core logic" — default: keep.
