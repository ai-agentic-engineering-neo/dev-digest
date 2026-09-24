# Context pack: Smart Diff (L03, second half)
Brief: lead scratchpad `smart-diff-brief.md` (B1–B20).

## INSIGHTS that apply
- [I1] `server/INSIGHTS.md:58` — "build response schemas from the @devdigest/shared contract … cover each route with an inject test that reads the fields" → the response is `SmartDiffResponse`.
- [I2] `server/INSIGHTS.md:30` — "reach a sibling module only via c.modules.<name>.<method>(...) … never a direct file import of its application/ports.ts" → L08 imports `classifyFile` from `modules/smart-diff/index.ts`, the same way as `renderSkillBlock` (:31).
- [I3] `server/INSIGHTS.md:44` — "name/place it under a ring folder so depcruise sees it".
- [I4] `server/INSIGHTS.md:36` — "application may not import db/rows even type-only … infrastructure may import only application/ports.ts".
- [I5] `server/INSIGHTS.md:68` — "never write '**/' inside a /** */ comment; describe globs in prose instead".
- [I6] `server/INSIGHTS.md:19` — "always inject overrides.llm … for every provider id in tests" → also proves 0 model calls (B10).
- [I8] `server/INSIGHTS.md:11` — PR #482 is seeded with a patch and a done run; "LLM_PROVIDER_OVERRIDE=mock … for manual/e2e end-to-end checks".
- [C1] `client/INSIGHTS.md:14` — "stub fetch/EventSource, do not vi.mock('@/lib/hooks/*')" (renderWithProviders + mockFetch).
- [C2] `client/INSIGHTS.md:19` — the refetch rolls back the optimistic effect → assert the POST, or two fixed states.
- [C3] `client/INSIGHTS.md:31` — prReview.json is shared; "change only route-owned subkeys" → `smartDiff.*`.
- [C4] `client/INSIGHTS.md:32` — one ref-counted EventSource per run; the terminal event refreshes run-scoped PR queries → reuse `useRunEvents`.
- [C5] `client/INSIGHTS.md:33` — "never write a key literal or invalidate from a page/component".
- [C6] `client/INSIGHTS.md:59` — "set borderTopColor/RightColor/BottomColor + borderLeftColor, never borderColor".
- [C9] `client/INSIGHTS.md:18` — run the full client suite alone before calling a failure real. Filter by file name, not a bracket path (:49).
- [C10] `client/INSIGHTS.md:30` — "keep new URL state in the page's searchParams" → here `usePrDetailSearch` (TAB_PARAM pattern).
- [C11] `client/INSIGHTS.md:55` — the page scrolls inside `<main overflow:auto>` → keep the sticky header outside `overflow:hidden` (FileCard).
- [E1] `e2e/INSIGHTS.md` Codebase Patterns — uppercase labels → `wait --fn` + `innerText.toLowerCase()`; `set viewport 1280 2000`.

## Verified facts
- [F1] `vendor/shared/contracts/brief.ts` — SmartDiffRole has 3 values, the copies are identical; `SmartDiffResponse = SmartDiff` (`review-api.ts:92`); `server/test/contracts.test.ts:108`.
- [F2] `db/schema/pulls.ts:41` — pr_files(pr_id, path, additions, deletions, patch), unique(pr_id,path); `findings.start_line` is NOT NULL; Severity = CRITICAL|WARNING|SUGGESTION.
- [F3] `reviews/repository/review.repo.ts:51-57` — reviews come newest-first by `desc(createdAt)`; one review per agent run (`review-service.ts:58`).
- [F4] `pulls/service.ts:89-113` — getDetail rewrites pr_files before it returns, so smart-diff fetched after detail sees fresh files.
- [F5] `intent/infrastructure/repository.ts:1-6` — "each module owns the reads it needs".
- [F6] `_shared/context.ts` getContext, `_shared/schemas.ts:11` IdParams; see `intent/http/routes.ts`.
- [F7] `DiffTab.tsx` — comments start hidden; toggle only if `commentCount>0`; `diff.showComments({count})`.
- [F8] `components/diff-viewer` — index exports DiffViewer + DiffCommentApi; `keysForLine`/`partitionThreads` in `comments.ts`; FileCard is `overflow:hidden` and holds the MessageSquare counter; no tests yet.
- [F9] route `_components/FindingCard` — props `f, defaultExpanded, onAction, pending, …`; the header collapses it (B17).
- [F10] `lib/hooks/reviews.ts:25-32,205-211` — `invalidateRunScoped`; SSE onFinish invalidates `prKeys.all` where `queryKey[2] ∈ RUN_SCOPED_PR_KEYS`.
- [F11] `useRunEvents` is mounted only by RunStatus in FindingsTab/LiveReview; `onRunStart` switches to the findings tab (`PrDetailView.tsx:83`).
- [F12] `vendor/ui/primitives/tokens.ts:6` — `SEV[sev]={c,bg,icon,label}`; no segmented control; Button has `active`.
- [F13] prReview.json `smartDiff`: coreLabel "Core", wiringLabel, boilerplateLabel, filesCount, findingLines, groupedByRole, largeTitle/Body.
- [F14] Seed #482 = 4 core `src/*` files; flow 05 waits for `src/config.ts`.
- [F15] frontend-ui-architecture §2 — "Forbidden: `src/components` → `src/app`".

## Mirrors
- `server/src/modules/intent/` (layout, composition, route); `server/test/pulls-comments.it.test.ts` (pg + inject).
- `diff-viewer/comments.ts` + `OutdatedComments/`; `lib/hooks/intent.ts`; `PrDetailView/usePrDetailSearch.ts`.

## Skill map (from routing.json)
| Step | Files | Skills | Key rules |
|---|---|---|---|
| S1 | `*/src/vendor/shared/**`, contracts.test.ts | drift_check, zod | both copies |
| S2–S4 | `server/src/modules/smart-diff/**` | onion-architecture, typescript-expert, security, zod (importers) | pure domain; ports; workspace-scoped 404 |
| S4 | `smart-diff/http/**` | fastify-best-practices | schema-first; inject |
| S5–S8 | `client/src/**/*.ts(x)` | frontend-ui-architecture, react-best-practices, typescript-expert, security | components↛app; hooks own keys; derive, don't store |
| S7–S8 | `client/src/app/**` | next-best-practices | the view stays a client leaf |
| S5–S8 | `client/**/*.test.tsx` | react-testing-library | roles; mock at fetch |
| S0, S9 | md, flow json | — | — |

## Risks
- Server/client "latest" review mismatch → both use `desc(createdAt)` (client gets server order).
- Toggle default changes GitHub-comment visibility → DiffTab test + open question.
- Glob escaping or ReDoS → fixed patterns only, escaped, `[^/]*` segments.
- Sticky header inside `overflow:hidden` [C11].

## Notes for reviewers
- Architecture: new module, no cross-module imports; DiffViewer is feature-agnostic via the slot.
- Security: workspace-scoped PR lookup (404); finding text only via FindingCard's Markdown.
