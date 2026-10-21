# Plan: Onboarding Tour · branch feat/onboarding-tour

Design-system task: yes (scope: the `onboarding-tour` item in `client/src/vendor/ui/nav.ts` and `pre` block rendering in `client/src/vendor/ui/primitives/Markdown.tsx`; nothing else under `client/src/vendor/ui/`; new UI pieces go to `/showcase`)
Execution mode: multi-agent
Requirements source: specs/onboarding-tour.md (SPEC-02, draft; draft status accepted by the main session for the autonomous run)

Status: READY. Q1–Q4 were answered on 2026-10-21 by the main session with the planner's defaults, each option A (D1–D4), since the run was autonomous; the user can revisit them. S1 is declined (no spec revision); S2 stays applied. Nothing is open.

## Requirements review

Evidence paths are repo-relative. "unverified" means the planner did not open that file. The implementer confirms it while building the row.

| Id | Requirement (spec wording, shortened) | Verdict | Evidence | Covered by |
|---|---|---|---|---|
| AC-1 | Page at `/repos/[repoId]/tour` in `AppShell`, crumb `<owner>/<name> › Onboarding Tour` | OK | crumb pattern `client/src/app/repos/[repoId]/pulls/page.tsx:66` | rows 24, 25 |
| AC-2 | Sidebar item `onboarding-tour` between Pull Requests and Project Context, `g t`, palette "Go to Onboarding Tour" | OK | `client/src/vendor/ui/nav.ts:25-26`; the palette and `g` keys are derived from `NAV` (`useShellCommands.ts:21`, `useGlobalShortcuts.ts:45`); label already in `client/messages/en/shell.json:19` | row 17 |
| AC-3 | `/repos/<id>/tour` marks `onboarding-tour` active | OK | `client/src/components/app-shell/helpers.ts:26` | row 18 |
| AC-4 | `/onboarding` does NOT mark it active | CONFLICT with code (fixed by this plan) | `helpers.ts:29` maps `/onboarding` to `onboarding-tour` today | row 18 (remove that line) |
| AC-5 | `GET /repos/:id/onboarding` → `OnboardingView {tour, run, stale}`, DB only | OK | pattern `server/src/modules/conventions/routes.ts:57` | rows 1, 6–10 |
| AC-6 | `POST /repos/:id/onboarding/generate` → 202 + running run, background job | OK | `conventions/routes.ts:62`, `conventions/service.ts:40` | rows 8, 9 |
| AC-7 | `getContext()`, workspace scope, unknown repo → 404 envelope | OK | `conventions/service.ts:207` | rows 8, 9 |
| AC-8 | Exactly five cards, fixed order and titles, icon tile, title, chevron | OK | screenshots | rows 19, 27 |
| AC-9 | TOC "ON THIS PAGE", scroll-spy, hash via `router.replace` | OK | — | rows 20, 26 |
| AC-10 | TOC click scrolls and sets the hash | OK | — | row 20 |
| AC-11 | Load with `#id` scrolls once rendered | OK | — | rows 26, 28 |
| AC-12 | Chevron collapses/expands, local state | OK | — | row 19 |
| AC-13 | Architecture: `body` via `Markdown`, then `diagram` via `MermaidDiagram` | OK + design-system fix | `Markdown.tsx:17` renders every `code` node as an inline chip and has no `pre` override, so fenced blocks render flat (confirmed) | rows 16, 27 |
| AC-14 | Null/invalid diagram → body alone | OK (already true) | `client/src/components/mermaid-diagram/MermaidDiagram.tsx:29,59` returns null when the diagram is invalid | row 27 |
| AC-15 | Critical paths rows: path, why, Open | OK | — | rows 21, 27 |
| AC-16 | Run locally: numbered rows, monospace command, copy button | OK | — | rows 22, 27 |
| AC-17 | Copy writes exactly the command, brief confirmation on that row | OK | clipboard pattern `CandidateCard.tsx:45` | rows 15, 22 |
| AC-18 | Reading path: numbered badges from 1, path, rationale | OK | — | rows 23, 27 |
| AC-19 | First tasks: 3–5 items, title, why, files with Open | GAP → D4 (decided) | spec does not say what happens to a task whose files are all dropped, or to fewer than 3 tasks | rows 3, 5, 27 |
| AC-20 | Header "Onboarding for `<name>`" (name in monospace accent) | OK | screenshot | row 26 |
| AC-21 | Subtitle "Generated from index of N files · last refreshed <rel>", model + cost | OK | `client/src/lib/relative-time.ts:7` already reads "now" for future times; `client/src/lib/format-cost.ts` | row 26 |
| AC-22 | Regenerate / empty-state button → POST generate | OK | `client/src/lib/hooks/conventions.ts:30` | rows 14, 26 |
| AC-23 | While running: Regenerate disabled with a spinner; poll GET until the run ends | OK | `hooks/conventions.ts:25` refetchInterval | rows 14, 26 |
| AC-24 | One running run per repo; return a young one; reap one older than the stale limit | OK | `conventions/service.ts:44-68`, partial unique index `server/src/db/schema/knowledge.ts:56` | rows 2, 6, 8 |
| AC-25 | No clone → 422, no run | OK (status code unverified) | conventions throws `ValidationError` for not-cloned (`conventions/service.ts:42`); the planner did not check that its statusCode is 422 (`server/src/platform/errors.ts:25`) | rows 8, 10 (route test asserts 422) |
| AC-26 | Inputs chosen in code: README, manifests, compose, Makefile, `.env.example`, `getTopFilesByRank`, `getCriticalPaths`, read via git, capped | OK | `server/src/modules/repo-intel/types.ts:166-171`; git reads at the default branch via `listFiles` + `showFile` (`server/src/modules/project-context/service.ts:217,249`) | rows 4, 5, 8 |
| AC-27 | One structured call on the `onboarding` feature model; file content inside `<untrusted source="path">` | OK | `conventions/service.ts:85`, `conventions/helpers.ts:86` | rows 5, 7, 8 |
| AC-28 | Drop every path not in the indexed list or the files read | UNCLEAR → D2 (decided) | the facade has no "list indexed files" method; membership is available through `getFileRank(repoId, paths)` (`repo-intel/service.ts:418`), which returns `[]` when the flag is off | rows 5, 8 |
| AC-29 | Keep a command only if it is a `package.json` script (any package manager) or a verbatim line of a read README/compose/Makefile/`.env.example` | OK as written (S1 declined) | the design's `pnpm install` survives only if it appears verbatim in the README | rows 5, 8 |
| AC-30 | Empty after verification → stored empty, explicit empty note, no fallback | OK | — | rows 5, 27 |
| AC-31 | Model order kept for the reading path; numbered from 1 after dropping | OK | — | rows 5, 23 |
| AC-32 | Run row stores status, provider, model, tokens, cost (price book, null if unpriced), files_indexed, error, timestamps | OK | `StructuredResult.costUsd` (`server/src/vendor/shared/adapters.ts:72-80`) is already priced through the PriceBook hook (`server/src/platform/container.ts:288-291`) | rows 2, 6, 8 |
| AC-33 | Done → replace stored tour + metadata; failed → stored tour unchanged | OK | — | row 6 (one transaction) |
| AC-34 | While running or after a failure: keep the last tour; failure → inline error banner | OK | — | rows 26, 28 |
| AC-35 | Output fails the contract → `failed`, "the model returned an invalid tour" | OK | — | row 8 |
| AC-36 | Index degraded/partial/failed or flag off → still generate from the tree + read files, `limited` | OK | `IndexStatus` (`repo-intel/types.ts:25`); a never-indexed repo reports `degraded`/`no_data` (`repo-intel/service.ts:192`) | rows 5, 8 |
| AC-37 | Limited banner with "Rebuild index" → `POST /repos/:id/resync`, refetch once `updatedAt` advances | OK | `client/src/lib/hooks/repo-intel.ts:31,41`; INSIGHTS client 2026-10-12 (BlastRadiusCard `rebuildFrom`) | row 26 |
| AC-38 | `stale` when index `updatedAt` or `last_polled_at` > `generated_at` | OK | `repos.last_polled_at` (`server/src/db/schema/repos.ts:17`) | rows 3, 8 |
| AC-39 | Stale hint next to the subtitle; no auto-regenerate | OK | — | row 26 |
| AC-40 | Open → `githubBlobUrl(full_name, default_branch, path)`, new tab, `noopener noreferrer` | OK | `client/src/lib/github-urls.ts:29` (its parameter is named `sha`; a branch name works in the URL) | row 21 |
| AC-41 | `full_name` unknown → Open copies the path with a confirmation | OK | `Repo.full_name` is never null (`contracts/platform.ts:146`), so "unknown" means the repo is not loaded yet | row 21 |
| AC-42 | Share link copies the URL with the hash, toast, tooltip "this machine only" | OK | `client/src/lib/toast.tsx` (unverified API) | row 26 |
| AC-43 | Feature model in the Regenerate tooltip and the empty-state button, from settings | OK | `useSettings` (`client/src/lib/hooks/core.ts:21`), `client/src/lib/feature-models.ts:15` | rows 13, 26 |
| AC-44 | Loading skeletons for the header and cards | OK | — | row 26 |
| AC-45 | GET fails → `ErrorState` "Couldn't load the onboarding tour" + Retry | OK | `onboarding.json` already has `loadError.title` | rows 26, 29 |
| AC-46 | No tour and no running run → `EmptyState` "Generate onboarding tour" naming the five sections | OK | — | row 26 |
| AC-47 | No clone → "Repository not cloned yet", no generate button | UNCLEAR → D1 (decided) | EC "Clone deleted from disk" says the stored tour still loads; precedence is not stated | row 26 |
| AC-48 | Unknown `repoId` → `RepoNotFound` | OK | `pulls/page.tsx:64` | row 26 |
| AC-49 | No tour + running → "Generating…" with the model | OK | — | row 26 |
| AC-50 | Markdown only via `Markdown`, diagram only via `MermaidDiagram`, no model HTML | OK | `Markdown.tsx` uses react-markdown without `rehype-raw` | rows 16, 27 |
| AC-51 | Stored json validated on read; old shape → no tour → empty state | OK | old shape `contracts/knowledge.ts:29-47` | rows 1, 6 |
| AC-52 | Commands are never executed | OK | — | rows 8, 22 |
| AC-53 | `Onboarding`, `OnboardingSection`, `OnboardingLink` replaced by the five-kind structure; client copy replaced by copying the server file | OK, but the drift claim is outdated | `git diff --no-index` shows `server/src/vendor/shared` and `client/src/vendor/shared` are identical today; INSIGHTS server 2026-09-25 (drift) is outdated for this file | rows 1, 12 |
| AC-54 | `onboarding_runs` + partial unique index; `onboarding` extended; `pnpm db:generate`; no boot migration | OK | `server/src/db/schema/context.ts:120` (table has no `workspace_id`) | rows 2, 11 |
| AC-55 | Strings in `client/messages/en/onboarding.json` (replacing the old copy), CSS variables only, keyboard-reachable controls | OK | `client/messages/en/onboarding.json:10` holds the old five-section copy | row 29 |
| AC-56 | Section card, command row, reading-path badge, TOC in `/showcase` | OK | `client/src/components/showcase/Showcase.tsx:46-50` imports from `src/components/*` only, so these pieces live there | rows 19–23, 30 |
| EC-1 | Tiny repo: at most that one file; empty notes | OK | — | rows 5, 27 |
| EC-2 | `repo_too_large` → tree fallback, Limited | OK | `DegradedReason` (`repo-intel/types.ts:31`) | rows 5, 8 |
| EC-3 | Hallucinated path dropped silently | OK | — | row 5 |
| EC-4 | Unknown command dropped; may show the empty note | OK | — | row 5 |
| EC-5 | Two clicks / two tabs → one run | OK | — | rows 2, 8 |
| EC-6 | Orphaned run reaped after the stale limit | OK | — | row 8 |
| EC-7 | Regenerate fails → old tour, banner, Regenerate enabled again | OK | — | rows 8, 26 |
| EC-8 | No API key → run `failed` with the provider error | OK | `container.ts:279` `ConfigError` is thrown inside the job and recorded | row 8 |
| EC-9 | Repo removed mid-run → cascade delete; the final write ends silently | OK | FK `onDelete: cascade` | rows 2, 6, 8 (catch FK 23503 / 0 rows) |
| EC-10 | Re-import keeps the tour; stale after the next sync | OK | — | row 3 |
| EC-11 | Rebuild index after generation → stale | OK | — | row 3 |
| EC-12 | Clone deleted → stored tour loads; Regenerate 422; not-cloned state | UNCLEAR → D1 (decided) | see AC-47 | rows 8, 26 |
| EC-13 | Old `{kind,title,body,diagram,links}` json → empty state | OK | — | rows 6, 10 |
| EC-14 | Fenced code block in `body` | confirmed defect → design-system fix | `Markdown.tsx:17-29` | row 16 |
| EC-15 | Invalid Mermaid → diagram omitted | OK | `MermaidDiagram.tsx:59` | row 27 |
| EC-16 | Long path/command wraps or scrolls in the row | OK | — | rows 21, 22 |
| EC-17 | No Clipboard API → nothing happens, no confirmation | GAP (existing copies always confirm) | `CandidateCard.tsx:46-47` sets `copied` unconditionally | row 15 (`copyText` returns false) |
| EC-18 | `generated_at` in the future → "now" | OK (already true) | `relative-time.ts:6` clamps at 0 | row 26 |
| EC-19 | Sidebar repo switch on the page → the new repo's `/tour` | GAP (code pushes `/pulls`) | `useShellContext.ts:42` | row 18 |
| EC-20 | Unknown hash ignored | OK | — | rows 20, 26 |
| EC-21 | Postgres down → error state + Retry | OK | — | row 26 |
| NFR-1 | GET makes no model and no GitHub call | OK | — | rows 8, 10 |
| NFR-2 | Exactly one model call; caps 6 000 / 60 000 as constants | OK (open question 2, adopted) | `conventions/constants.ts:28-29` | rows 4, 8 |
| NFR-3 | Cost and tokens recorded and shown; null → "—" | OK | `formatCost` | rows 6, 26 |
| NFR-4 | Background job; stale limit 10 min | OK | `conventions/constants.ts:41` | rows 4, 8 |
| NFR-5 | a11y: `aria-expanded`, accessible names, CSS variables | OK | — | rows 19–23 |
| NFR-6 | Mutation toast policy; a run failure in the banner does not also toast | OK | a failed run arrives as a 200 GET payload, not a mutation error, so it never toasts (`client/src/lib/providers.tsx:36-42`) | row 14 |
| NFR-7 | Secrets via `container.secrets`; log only path counts and the run id | OK | — | rows 8, 9 |
| NFR-8 | Onion: `modules/onboarding/` with routes/service/repository/ports, `lint:arch` with no new baseline entry | OK | onion skill ring map | rows 3–11 |
| OQ-1 | Fenced code blocks → design-system `pre` | adopted | confirmed above | row 16 |
| OQ-2 | Caps 6 000 / 60 000 as constants | adopted | — | row 4 |
| OQ-3 | Stale wording in `onboarding.json`; source is index `updatedAt` / `last_polled_at` | adopted | — | rows 3, 29 |
| OQ-4 | First tasks card: title, why, file rows with Open | adopted | — | rows 21, 27 |

## Suggestions (optional)

- S1 Accept install commands (`npm install`, `npm ci`, `pnpm install`, `yarn`, `yarn install`, `bun install`) when a `package.json` was read, even if no README line holds them. Why: the design's first command is `pnpm install` (screenshot 1), and under AC-29 it survives only when the README contains it verbatim. Status: declined (user, 2026-10-21; AC-29 stays as written, no spec revision).
- S2 Give the three existing clipboard callers the new `copyText` helper. Why: there are three copies (`client/src/app/conventions/_components/CandidateCard/CandidateCard.tsx:46`, `.../RunTraceDrawer/RunTraceDrawer.tsx:56`, `.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx:29`). The `LiveLogStream` copy in `vendor/ui` stays out of scope. Status: accepted (row 15b).

## Goal & acceptance criteria

The spec's criteria, verbatim by id. See `specs/onboarding-tour.md:47-123` for the full text. Each one is verified as listed.

- [ ] AC-1, AC-20, AC-21, AC-39, AC-44–AC-49: page states and header. Verified by `OnboardingTourView.test.tsx` (row 28) and e2e `15-onboarding-tour` (row 31).
- [ ] AC-2, AC-3, AC-4: nav. Verified by `client/src/components/app-shell/helpers.test.ts` (row 18) and e2e 15 (opened from the sidebar).
- [ ] AC-5, AC-6, AC-7, AC-25: routes. Verified by `server/test/onboarding-routes.test.ts` (row 10).
- [ ] AC-8–AC-12: cards, TOC, hash. Verified by `OnboardingTourView.test.tsx` plus the per-component tests (rows 19–20, 28).
- [ ] AC-13, AC-14, AC-50: Markdown and diagram. Verified by `TourSections.test.tsx` (row 27) and the showcase smoke (row 30).
- [ ] AC-15–AC-19, AC-40, AC-41: rows, copy, Open. Verified by the component tests (rows 21–23, 27).
- [ ] AC-22, AC-23, AC-34, AC-37, AC-42, AC-43: actions. Verified by `OnboardingTourView.test.tsx` (row 28).
- [ ] AC-24, AC-26–AC-33, AC-35, AC-36, AC-38: generation. Verified by `server/test/onboarding-helpers.test.ts` (row 5), `server/test/onboarding-service.test.ts` (row 8) and `server/test/onboarding.it.test.ts` (row 11).
- [ ] AC-51: read validation. Verified by `onboarding.it.test.ts` (an old-shape row gives `tour: null`).
- [ ] AC-52: the code has no exec path for commands (review). Verified by the security review.
- [ ] AC-53: verified by `server/test/contracts.test.ts` (row 12) and TC-1.
- [ ] AC-54: verified by `pnpm db:generate` output plus `onboarding.it.test.ts` (a second running insert gives 23505).
- [ ] AC-55: verified by `OnboardingTourView.test.tsx` (keyboard: chevron `aria-expanded`, named buttons) and review (no hex colours).
- [ ] AC-56: verified by `client/src/test/smoke.test.tsx` mounting `/showcase`.
- [ ] TC-1 `client/src/vendor/shared` is byte-identical to `server/src/vendor/shared`. Verified by `git diff --no-index --exit-code server/src/vendor/shared client/src/vendor/shared` (and the verify.sh drift check).
- [ ] TC-2 `pnpm lint:arch` (server) is green and `server/.dependency-cruiser-known-violations.json` is unchanged. Verified by `verify.sh`.
- [ ] TC-3 The `OnboardingDraft` model-output schema has no tuples and no unions that structured output rejects (plain object of five keys). Verified by `onboarding-helpers.test.ts` (parses a fixture) and review.
- [ ] TC-4 e2e flow `06-onboarding` still passes. Verified by `verify.sh run --e2e`.

## Out of scope

- Everything under the spec's Non-goals (`specs/onboarding-tour.md:22-32`): file viewer, writing to the repo folder, auto-regeneration, MCP tool, issue lookup, coloured diagram nodes, PR/multi-repo tours, changes to `/onboarding`, confirmation step, shareable links.
- Install commands without a README line (S1 declined; AC-29 as written).
- `client/src/vendor/ui/` beyond `nav.ts` and `primitives/Markdown.tsx`. This includes `LiveLogStream.tsx`'s own clipboard copy and `IconBtn` disabled support.
- `client/src/lib/providers.tsx` (no toast change is needed, see NFR-6).
- A server-side spec or doc page for the module (`server/specs/onboarding.md`, `client/specs/pages.md`, README API map): `doc-writer` after implementation.
- Reworking `relativeTime` or `githubBlobUrl`. They are reused as they are.

## Relevant INSIGHTS

- `server/INSIGHTS.md` 2026-09-26 "background scan can be orphaned … STALE_SCAN_MS … partial unique index → 23505 → return it" → rows 2, 8.
- `server/INSIGHTS.md` 2026-09-26 "module that needs a sibling module's service gets it from the container … typed structurally in its ports.ts" → rows 3, 9.
- `server/INSIGHTS.md` 2026-10-06 "use GitClient.showFile(repo, sha, path) … readFile reads the mutable working tree and is traversal-prone" → rows 3, 8. Read through `listFiles` + `showFile` at the default branch, never `readFile`.
- `server/INSIGHTS.md` 2026-09-26 "Naming a new contract … collides … TS2308" → row 1. The names were grepped: `OnboardingRun`, `OnboardingView` and `OnboardingDraft` are free.
- `server/INSIGHTS.md` 2026-09-26 "`pnpm db:generate` needs a TTY when a table both loses and gains columns" → row 11. The plan only adds columns, so no prompt is expected.
- `server/INSIGHTS.md` 2026-10-06 "db/seed.ts inserts with onConflictDoNothing … existing dev DB not updated" → row 32.
- `server/INSIGHTS.md` 2026-10-21 "implementer Bash guard blocks src/db/migrations with a redirect" → row 11.
- `server/INSIGHTS.md` 2026-10-12 "repository may import the module's helpers.ts for row-to-DTO mapping" → row 6.
- `client/INSIGHTS.md` 2026-09-26 "Importing a runtime value from @devdigest/shared breaks the dev server" → rows 13, 14, 19–28. The client imports `type` only and mirrors the section ids in a local `constants.ts`.
- `client/INSIGHTS.md` 2026-10-12 "resync answers 202 … remember updatedAt at click time, poll useRepoIntelStatus(repoId, true), invalidate own query when it advances" → row 26 (AC-37).
- `client/INSIGHTS.md` 2026-10-06 "Every mutation error is already toasted … pick one surface" → row 26. Do not render a second alert for a failed POST.
- `client/INSIGHTS.md` 2026-09-25 "nav.ts was edited (user-approved exception) … any further nav change goes there" → row 17.
- `client/INSIGHTS.md` 2026-10-06 "Deep relative imports into src/lib or src/components are an ESLint error" → all client rows use `@/`.
- `client/INSIGHTS.md` 2026-10-12 "vitest path filter with [repoId] finds nothing; filter by file name" → verification plan.
- `client/INSIGHTS.md` 2026-10-20 "TanStack refetch() ignores enabled:false" → row 26. Retry on the error state calls `refetch` only when `repoId` is set.
- `e2e/INSIGHTS.md` 2026-10-21 and 2026-10-12 "wait --text matches innerText after text-transform" → row 31. Do not wait on "ON THIS PAGE" or other uppercase labels.
- `e2e/INSIGHTS.md` 2026-09-26 "`find role link --name Conventions` fails; `find text` works for sidebar items" → row 31.
- `e2e/INSIGHTS.md` 2026-10-06 "only test-writer may edit e2e/specs/flows.md" → row 31.

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| Ring map (onion skill) | `modules/onboarding/*` | ports.ts ring 1; service/helpers/constants ring 2; repository ring 3a; routes ring 3b |
| `no-cross-module` | onboarding → repos, repo-intel, settings | `RepoLookupPort` and a `repoIntel` slice are typed structurally in `onboarding/ports.ts`. They are filled in routes.ts from `c.reposRepo`, `c.repoIntel`, `c.featureModel(ws, 'onboarding')` and `c.config.repoIntelEnabled`. No import of `modules/repo-intel/types.ts` (unverified whether ports may import it; to be safe, mirror the slice structurally) |
| `application-no-container` / `ports-are-pure` | service.ts, ports.ts | the service takes `OnboardingDeps`; ports import only `@devdigest/shared` types |
| Ring 2 does no I/O | prompt template | the system prompt is loaded in routes.ts via `loadPromptTemplate('onboarding.system.md')` (`server/src/platform/prompts.ts:24`) and passed as `deps.systemPrompt: () => Promise<string>`. The service does not import `platform/prompts` |
| `reviewer-core-boundary` | helpers.ts | do not import `wrapUntrusted`. Build `<untrusted source="…">` blocks in helpers.ts like `conventions/helpers.ts:86`, with the `source` attribute escaped (`"`, `<`, `>`, `&`) |
| Rule 10: the repository runs the transaction | finishing a done run | `completeRun(…)` upserts `onboarding` and updates `onboarding_runs` in one `db.transaction` |
| Rule 12: every repository method takes `workspaceId` | repository.ts | `onboarding` has no `workspace_id`. Scope reads and writes with a join or exists on `repos.workspace_id`; `onboarding_runs` carries `workspace_id` like `convention_scans` |
| Validate once at the edge | routes.ts | `IdParams` from `modules/_shared/schemas.js`; no body |
| Contracts copy | `client/src/vendor/shared` | copy the whole `knowledge.ts` over (row 12); never edit the client copy |
| Migrations | `server/src/db/migrations/*` | generated only by `pnpm db:generate`; never edited by hand |
| Design system | `client/src/vendor/ui/` | only `nav.ts` and `primitives/Markdown.tsx`; the showcase gets the new pieces |
| Client import direction | showcase ↔ tour pieces | the reusable pieces live in `client/src/components/<kebab>/` so both `/showcase` and the route import them; the route never imports another route's `_components` |
| Client: no runtime imports from `@devdigest/shared` | all client rows | `import type` only; section ids and kinds mirrored in `tour/_components/OnboardingTourView/constants.ts` |
| Page thin, `"use client"` at the leaf | `tour/page.tsx` | server page awaits `params` (Next 15) and renders `<OnboardingTourView repoId=… />`; the view carries `"use client"` |
| Depth budget (two `_components` levels) | tour route | `tour/_components/{OnboardingTourView,TourHeader,TourSections,LimitedBanner}`, flat |

## Existing patterns to follow

- Job + run table + stale reaper + 23505 → existing run: copy `server/src/modules/conventions/service.ts:40-124`.
- Ports / deps shape: `server/src/modules/conventions/ports.ts:52-92`.
- Route composition: `server/src/modules/conventions/routes.ts:39-67`.
- Repository mapping and finish update: `server/src/modules/conventions/repository.ts:15-80`.
- Partial unique index in Drizzle: `server/src/db/schema/knowledge.ts:53-59`.
- Default-branch git reads: `server/src/modules/project-context/service.ts:209-257` (`listFiles(ref, defaultBranch, globs)` → `{sha, files}`, then `showFile(ref, sha, path)`).
- Sample caps and truncation: `server/src/modules/conventions/helpers.ts:35-39`, `constants.ts:28-29`.
- Untrusted wrapping of samples: `server/src/modules/conventions/helpers.ts:85-88`.
- Container getter + override: `server/src/platform/container.ts:148-150, 74-75`.
- Module registration: `server/src/modules/index.ts:29-43`.
- Unit and route tests: `server/test/project-context-service.test.ts`, `server/test/project-context-routes.test.ts`, `server/test/conventions-helpers.test.ts`. IT tests: `server/test/conventions.it.test.ts`, `server/test/helpers/pg.ts`. Doubles: `MockLLMProvider`, `MockGitClient` (`listFiles` / `showFile` at `server/src/adapters/mocks.ts:320,333`).
- Polling query + mutation hook: `client/src/lib/hooks/conventions.ts:20-39`.
- Resync + updatedAt watch: `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.tsx` (`rebuildFrom`).
- Page states and crumb: `client/src/app/repos/[repoId]/pulls/page.tsx:63-131`.
- Copied-confirmation timer: `client/src/app/conventions/_components/CandidateCard/CandidateCard.tsx:45-50`.
- Component test setup (next/navigation mock + `NextIntlClientProvider`): `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`.
- Seeded read-only data for e2e: `server/src/db/seed.ts:84-102` (repo) and `:215-255` (pr_intent with `onConflictDoNothing`).
- Flow shape: `e2e/specs/14-project-context.flow.json`.

## Work breakdown (ordered)

Skills come from the routing table in `.claude/skills/pr-self-review/reference/routing.md`. The planner did not open that table, so the implementer should confirm with `route.sh -`. Per §1.5, `security` and `typescript-expert` appear only where noted.

| # | Package | Module / ring · layer | File (new/edit) | Change | Skills to apply | Test |
|---|---|---|---|---|---|---|
| 1 | server | vendor/shared · 0 | `src/vendor/shared/contracts/knowledge.ts` (edit) | Replace `OnboardingLink` / `OnboardingSection` / `Onboarding`. Per-kind schemas with `kind: z.literal('architecture' \| 'critical_paths' \| 'run_locally' \| 'reading_path' \| 'first_tasks')`. `OnboardingSection` = `z.discriminatedUnion('kind', …)`. `Onboarding` = `{ generated_at, provider, model, tokens_in, tokens_out, cost_usd: nullable, files_indexed, limited, sections: z.tuple([five in order]) }`. `OnboardingLink` stays as `{ path }` for the path rows (or is removed if unused; AC-53 names it). Add `OnboardingRun` (`status: running\|done\|failed`, nullable `provider`/`model`/`cost_usd`/`error`/`finished_at`, numeric tokens and `files_indexed`), `OnboardingView { tour: Onboarding.nullable(), run: OnboardingRun.nullable(), stale: boolean }`, and the model-output schema `OnboardingDraft` (a plain object keyed by kind, no titles, `.describe()` on each field, `first_tasks.items` `.max(5)`, `run_locally.items[].note` optional). Update the file header comment | zod, typescript-expert | row 12 |
| 2 | server | db · 3a | `src/db/schema/context.ts` (edit) | New `onboardingRuns` (`onboarding_runs`): `id` uuid pk, `workspace_id` fk cascade, `repo_id` fk cascade, `status` text enum default running, `provider`, `model`, `tokens_in` int default 0, `tokens_out` int default 0, `cost_usd` double nullable, `files_indexed` int default 0, `error` text, `started_at` default now, `finished_at`. Index `(workspace_id, repo_id, started_at)`; partial unique `onboarding_runs_one_running_uidx` on `repo_id` where `status = 'running'`. Extend `onboarding` with nullable `run_id` (fk set null), `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `files_indexed`, `limited` boolean default false. These are nullable or defaulted so existing rows migrate; `json` keeps `{ sections }` only. Export from `src/db/schema.ts` (edit, line 37 import and the list) | drizzle-orm-patterns, postgresql-table-design | row 11 |
| 3 | server | onboarding · 1 | `src/modules/onboarding/ports.ts` (new) | `OnboardingRepositoryPort` (`getStored(ws, repoId) → { onboarding: Onboarding \| null }`, which validates and returns null for an invalid shape; `getLatestRun`; `createRun(ws, repoId, model)`; `failRun(ws, runId, error, partial)`; `completeRun(ws, repoId, runId, tour)` in one transaction). `RepoLookupPort` (`id, owner, name, fullName, defaultBranch, clonePath, lastPolledAt: Date \| null`). `repoIntel` slice (`getIndexState → { status, filesIndexed, updatedAt: Date, degraded?, degradedReason? }`, `getTopFilesByRank`, `getCriticalPaths`, `getFileRank`). `git: Pick<GitClient,'listFiles'\|'showFile'>`. `llm`, `featureModel`, `jobs`, `systemPrompt`, `repoIntelEnabled: boolean`, `log?`, `now?: () => Date`. `GenerateJobPayload` | typescript-expert (structural ports) | via row 8 |
| 4 | server | onboarding · 2 | `src/modules/onboarding/constants.ts` (new) | `GENERATE_JOB_KIND = 'onboarding.generate'`, `MAX_FILE_CHARS = 6_000`, `MAX_TOTAL_CHARS = 60_000`, `STALE_RUN_MS = 10 * 60_000`, `TOP_FILES = 12` (D5), `SECTION_TITLES` (five English titles), `MANIFEST_FILES` (`package.json`, `Makefile`, `docker-compose.yml/.yaml`, `compose.yml/.yaml`, `.env.example`), README name pattern, `MAX_FIRST_TASKS = 5`, `INVALID_TOUR_ERROR = 'The model returned an invalid tour'` | — | row 5 |
| 5 | server | onboarding · 2 | `src/modules/onboarding/helpers.ts` (new) | Pure functions. `selectInputPaths(tree, ranked, chains)`: root README + manifests at the root and at depth 1 (D5), then ranked files, then chain files, deduped. `truncate(text)`. `buildMessages(repoFullName, systemPrompt, files, tree, chains, limited)`: every file in `<untrusted source="escaped">`, the tree and chains as data blocks. `scriptsFrom(packageJsonText)`, which tolerates invalid JSON. `isVerifiedCommand(cmd, { scripts, lines })`: trims and strips a leading `$ `; accepts `(npm\|pnpm\|yarn\|bun) [run] <script>` (plus `npm start`/`npm test`) for a script in any read `package.json`, or an exact trimmed line of a read README/compose/Makefile/`.env.example` (D3; no install allow-list, S1 declined). `verifyDraft(draft, { allowedPaths, scripts, lines }) → sections` (AC-28–AC-31, D4): drop unknown paths, keep order, drop first tasks with no files left, cap first tasks at 5, diagram `''` → null. `toTour(sections, meta)` with fixed titles. `isStale(generatedAt, indexUpdatedAt, lastPolledAt)` | security (prompt content, untrusted file text) | `server/test/onboarding-helpers.test.ts` (new): path drop, order and numbering, command forms, comment line, unknown command (incl. `pnpm install` absent from the README → dropped), empty section, task without files, attribute escaping, stale matrix |
| 6 | server | onboarding · 3a | `src/modules/onboarding/repository.ts` (new) | `implements OnboardingRepositoryPort`; maps rows to DTOs (it may import `helpers.ts`, per INSIGHTS 2026-10-12). `getStored` joins `repos` on `workspace_id`, assembles columns + `json.sections` and runs `Onboarding.safeParse`; a failure returns null (AC-51). `completeRun` in `db.transaction`: upsert `onboarding` (`onConflictDoUpdate` on `repo_id`) and update the run to done with tokens, cost and `files_indexed`. `failRun` updates the run only (AC-33) | drizzle-orm-patterns | row 11 |
| 7 | server | prompts | `src/prompts/onboarding.system.md` (edit) | Rewrite for the five kinds: grounding rules (paths only from the input; commands only copied from read files, no trailing comments, put notes in `note`); untrusted-data clause; Mermaid rules kept (`flowchart`, quoted labels, null when absent); 3–5 first tasks, each citing files; Markdown only, no HTML. Remove `{{sections}}` / `{{language}}` placeholders, or fill them in row 9 | security (prompt-injection surface) | via row 8 (mock LLM) |
| 8 | server | onboarding · 2 | `src/modules/onboarding/service.ts` (new) | `OnboardingService(deps)` registers the job. `view(ws, repoId)`: repo or 404, `getStored`, `getLatestRun`, `getIndexState`, then `stale`. No model or git call (NFR-1). `generate(ws, repoId)`: 404, no clone → `ValidationError` (422, AC-25), reap a stale run (AC-24), `createRun` with the 23505 fallback, enqueue, return run. `runGeneration(payload)` never throws: index state + `repoIntelEnabled` → `limited`; `listFiles(ref, defaultBranch, ['**'])` → tree + sha; ranked and chains only when not limited; read the chosen files with `showFile(ref, sha, path)` within the caps; one `completeStructured({ schema: OnboardingDraft, … temperature: 0, sessionId: 'onboarding:<repo>:<runId>' })`; a Zod/parse failure → `INVALID_TOUR_ERROR` (AC-35). Allowed paths = files read ∪ (`getFileRank(allCandidatePaths)` paths when not limited) ∪ (tree when limited) (D2). `files_indexed` = index `filesIndexed`, or the tree size when limited (D6). `completeRun`. Catch: `failRun` with `err.message`; FK/0-row on a deleted repo → return silently (EC-9). Logs carry only counts and the run id (NFR-7) | security (external call, untrusted content) | `server/test/onboarding-service.test.ts` (new, in-memory fake repo, `MockLLMProvider`, fake git/repoIntel): 422 without clone, young running run returned, stale run reaped, limited path, invalid output → failed with message, failed keeps the stored tour, cost/tokens recorded, a single model call |
| 9 | server | onboarding · 3b | `src/modules/onboarding/routes.ts` (new) | `GET /repos/:id/onboarding` → `OnboardingView`; `POST /repos/:id/onboarding/generate` → 202 `{ run }`. Builds the service from `c.onboardingRepo`, `c.reposRepo`, `c.repoIntel`, `c.git`, `c.llm`, `c.featureModel(ws,'onboarding')`, `c.jobs`, `c.config.repoIntelEnabled`, `systemPrompt: () => loadPromptTemplate('onboarding.system.md')`, `log`. `getContext` first in both handlers. The client hook (row 14) reads `{ run }` | fastify-best-practices, onion-architecture-backend | row 10 |
| 10 | server | tests | `test/onboarding-routes.test.ts` (new) | `app.inject` with `ContainerOverrides.onboardingRepo` fake: 404 envelope, 422 without clone (and no run), 202 shape, GET returns `{tour:null, run:null, stale:false}` | — | itself |
| 11 | server | db · migration + IT | `pnpm db:generate` → new `src/db/migrations/00NN_*.sql` + `meta/` (generated); `test/onboarding.it.test.ts` (new) | Generate and commit. Read the SQL with `Read`, not `cat`, because of the guard (INSIGHTS 2026-10-21). IT: second running insert → 23505 → `generate` returns the same run; `completeRun` replaces the tour atomically; an old-shape `json` row → `tour: null`; a repo delete cascades both tables; `stale` from `last_polled_at` | drizzle-orm-patterns, postgresql-table-design | itself (Docker) |
| 11b | server | root | `src/platform/container.ts` (edit), `src/modules/index.ts` (edit) | `get onboardingRepo(): OnboardingRepositoryPort` + `ContainerOverrides.onboardingRepo`; register `onboarding` in `modules` | onion-architecture-backend | row 10 |
| 12 | server + client | contracts copy | `test/contracts.test.ts` (edit, lines 146–159); `client/src/vendor/shared/contracts/knowledge.ts` (replaced by copying the server file) | The test parses a five-section `Onboarding`, rejects the old shape, and parses an `OnboardingDraft` fixture (TC-3). Then copy `server/src/vendor/shared/contracts/knowledge.ts` over the client file and run TC-1. Also grep `server/src` and `client/src` for other `Onboarding`/`OnboardingSection` consumers (the planner found none beyond these) | zod | itself + TC-1 |
| 13 | client | lib · domain | `src/lib/feature-models.ts` (edit) | Add a pure `featureModelFor(settings, id) → { provider, model }` (settings override, else the registry default) for AC-43. Use `import type` only | — | `src/lib/feature-models.test.ts` (new, small) |
| 14 | client | lib · api hooks | `src/lib/hooks/onboarding.ts` (new) | `useOnboarding(repoId)`: queryKey `['onboarding', repoId]`, `enabled: !!repoId`, `refetchInterval` 2 s while `run?.status === 'running'`. `useGenerateOnboarding()`: POST, then `setQueryData` with the running run (keep `tour`) and invalidate. Not added to the `hooks/index.ts` barrel | react-best-practices | via row 28 (mocked fetch) |
| 15 | client | lib · domain | `src/lib/clipboard.ts` (new) | `copyText(text): Promise<boolean>`: false when `navigator.clipboard` is missing or rejects (EC-17) | — | `src/lib/clipboard.test.ts` (new) |
| 15b | client | existing views | `src/app/conventions/_components/CandidateCard/CandidateCard.tsx`, `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx`, `.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx` (edit) | Use `copyText`; show the copied state only when it resolves true. No other change (S2) | react-best-practices | existing `CandidateCard.test.tsx`, `RunTraceDrawer.test.tsx` stay green |
| 16 | client | vendor/ui · design system | `src/vendor/ui/primitives/Markdown.tsx` (edit) | Add a `pre` renderer: block with `var(--bg-elevated)` background, border, padding, `overflowX: auto`, mono, with the nested `code` unstyled. Inline `code` stays a chip: detect a block by the parent `pre`, for example a `pre` override that clones its child with a `data-block` flag, or `node.position` / a className check. Implementer's choice; no hard-coded colours | react-best-practices | showcase entry (row 30) with a fenced block; smoke test |
| 17 | client | vendor/ui · design system | `src/vendor/ui/nav.ts` (edit) | Insert `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Workflow" (or "Boxes"; the screenshot glyph is not in `icons.tsx`), href: "/repos/:repoId/tour", gKey: "t" }` between `pulls` and `context`; add `{ keys: "g t", label: "Go to Onboarding Tour", group: "Navigation" }` to `SHORTCUTS`. The palette label comes from `shell.commandPalette.goTo` + `shell.nav.onboarding-tour` (already present) | — | row 18 test + e2e 15 |
| 18 | client | components · app-shell | `src/components/app-shell/helpers.ts` (edit), `src/components/app-shell/hooks/useShellContext.ts` (edit), `src/components/app-shell/helpers.test.ts` (new) | `activeKeyFor`: drop the `/onboarding` branch; add `^/repos/[^/]+/tour` → `onboarding-tour` before `/pulls` (AC-3, AC-4). `onSelectRepo`: when the pathname matches `/repos/<id>/tour`, push `/repos/<new>/tour` (EC-19), possibly via a pure `repoSwitchTarget(pathname, id)` in helpers.ts. Keep the file's existing relative imports (legacy list) | react-frontend-architecture | `helpers.test.ts`: `/repos/x/tour` → onboarding-tour, `/onboarding` → '', switch target |
| 19 | client | components (cross-route) | `src/components/tour-section-card/{TourSectionCard.tsx,index.ts,styles.ts}` (new) | Card: icon tile, `<h2>` title, chevron `IconBtn`/button with `aria-expanded` + `aria-controls` and an accessible name; children collapsible; `id` anchor for the hash; local `useState` collapsed | react-frontend-architecture, react-best-practices | `TourSectionCard.test.tsx` (new): toggles, `aria-expanded` |
| 20 | client | components | `src/components/tour-toc/{TourToc.tsx,index.ts,styles.ts}` (new) | Presentational: `items {id,label}[]`, `activeId`, `onSelect(id)`; links are `<a href="#id">` (keyboard-reachable) whose click calls `onSelect`; the active one has an accent bar. Scroll-spy lives in the view (row 26) | react-frontend-architecture | `TourToc.test.tsx` (new) |
| 21 | client | components | `src/components/tour-path-row/{TourPathRow.tsx,index.ts,styles.ts,helpers.ts}` (new) | Row: file icon, monospace path (wraps/`overflowWrap: anywhere`), optional `— why`, "Open" button. `repo?: { full_name, default_branch }`: present → `window.open(githubBlobUrl(...), '_blank', 'noopener,noreferrer')` (AC-40); absent → `copyText(path)` + copied state (AC-41). Labels come in as props (i18n from the caller) | react-best-practices | `TourPathRow.test.tsx` (new): open URL, copy fallback |
| 22 | client | components | `src/components/tour-command-row/{TourCommandRow.tsx,index.ts,styles.ts}` (new) | Number, monospace command (`overflowX: auto`), optional note, copy button with an accessible name; copied confirmation per row via `copyText` (AC-17, EC-17); never executes | react-best-practices | `TourCommandRow.test.tsx` (new): exact text copied, no confirmation when the API is missing |
| 23 | client | components | `src/components/tour-reading-step/{TourReadingStep.tsx,index.ts,styles.ts}` (new) | Numbered badge (CSS variables), monospace path, muted rationale below | — | covered by row 27 test |
| 24 | client | app · route | `src/app/repos/[repoId]/tour/page.tsx` (new) | Server component: `const { repoId } = await params; return <OnboardingTourView repoId={repoId} />` | next-best-practices | — |
| 25 | client | app · route view | `src/app/repos/[repoId]/tour/_components/OnboardingTourView/{OnboardingTourView.tsx,index.ts,styles.ts,constants.ts,helpers.ts}` (new) | `"use client"`. `AppShell` crumb `[{label: full_name, mono}, {label: t('crumb')}]` (AC-1). `constants.ts`: `SECTION_IDS` (`architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`) mapped to kinds and i18n keys, icons, poll intervals. `helpers.ts`: `viewState(view, query, repo)` → loading \| error \| notFound \| notCloned \| empty \| generating \| tour, with D1 precedence (a stored tour wins over not-cloned), `sectionFromHash(hash)` (unknown → null, EC-20), `subtitleParts` | react-frontend-architecture, react-best-practices | `helpers.test.ts` (new) |
| 26 | client | app · route view | same folder + `tour/_components/TourHeader/…` and `tour/_components/LimitedBanner/…` (new) | Compose states (AC-44–49) with `Skeleton`, `ErrorState` + Retry (only when `repoId`), `EmptyState` + generate button (model label), "Generating…" with the model, `RepoNotFound` via `useRepoNotFound`. `TourHeader`: title (AC-20); subtitle with `relativeTime` + model + `formatCost` (null → "—"); stale hint (AC-39); Regenerate (`Button` with spinner, disabled while running, tooltip = model, AC-23/43); when the repo has no clone, the Regenerate button is replaced by a "Repository not cloned yet" note while the stored tour stays visible (D1); Share link (`copyText(location.href)` → toast, tooltip "works on this machine only", AC-42). Failed-run banner with `run.error` (AC-34). `LimitedBanner`: "Limited: no code index" + Rebuild index (`useResyncRepoIntel`, remember `updatedAt` at click, poll `useRepoIntelStatus(repoId, true)` until it advances, then invalidate `['onboarding', repoId]`, AC-37). Scroll-spy: `IntersectionObserver` over the five anchors → `activeId` → `router.replace('#'+id, { scroll: false })` (AC-9). TOC click → `scrollIntoView` + replace (AC-10). Initial hash → scroll once the tour has rendered (AC-11) | react-frontend-architecture, react-best-practices, next-best-practices | row 28 |
| 27 | client | app · route view | `tour/_components/TourSections/{TourSections.tsx,index.ts,styles.ts}` (new) | Maps the five typed sections to `TourSectionCard` with bodies: architecture → `Markdown` body + `MermaidDiagram` when `diagram` is set (AC-13/14); critical paths → `TourPathRow`s; run locally → `TourCommandRow`s; reading path → `TourReadingStep` numbered from 1 (AC-31); first tasks → title, why, `TourPathRow` per file (AC-19). An empty items list shows that section's empty note (AC-30). Model text never goes into `dangerouslySetInnerHTML` (AC-50) | react-best-practices | `TourSections.test.tsx` (new): five titles in order, empty notes, null diagram renders no box (mock `@/components/mermaid-diagram`) |
| 28 | client | tests | `tour/_components/OnboardingTourView/OnboardingTourView.test.tsx` (new) | Mocked fetch + `next/navigation` + intl: loading skeleton, error + Retry, empty + generate POST, running (spinner, disabled, polls), failed banner keeps the old tour, limited banner → resync, stale hint, not-cloned without a tour (state, no button), not-cloned with a tour (tour + note, no Regenerate, D1), unknown repo, hash scroll (stub `scrollIntoView`), keyboard focus on the chevron and copy buttons | react-testing-library | itself |
| 29 | client | i18n | `messages/en/onboarding.json` (edit, replace content) | Keys under camelCase: `crumb`, `title` ("Onboarding for {name}" split for the accent span), `subtitle`, `stale` (OQ-3 wording, e.g. "Repository changed since this tour was generated"), `regenerate`, `regenerateTooltip`, `shareLink`, `shareTooltip`, `shareCopied`, `copied`, `open`, `copyCommand`, `toc.title` ("On this page"), `sections.<kind>.title` + `.empty`, `limited.title` / `.rebuild`, `runFailed`, `generate.{title,body (names the five sections),cta,generating}`, `notCloned.{title,body,note}`, `loadError.{title,retry}`, `collapse` / `expand`. How the namespace is loaded is unverified (`client/src/i18n/request.ts:11` suggests per-file auto-load) | — | via rows 27–28 |
| 30 | client | showcase | `src/components/showcase/Showcase.tsx` (edit) | Group "Onboarding tour": `TourSectionCard` (expanded + collapsed), `TourToc`, `TourCommandRow`, `TourReadingStep`, `TourPathRow` (with and without a repo), and a `Markdown` sample with a fenced block (row 16) | — | `client/src/test/smoke.test.tsx` (existing; add the `onboarding` messages only if the pieces read intl; prefer props-only pieces) |
| 31 | e2e | flow | `e2e/specs/15-onboarding-tour.flow.json` (new); `e2e/specs/flows.md` (edit, section 15); `e2e/README.md` (edit, coverage row) | Open `{BASE}/agents`, settle, `find text "Onboarding Tour" click`, `wait --url /tour`, then `wait --text` for "Onboarding for", "Architecture overview", "How to run locally", "First tasks", a seeded command (for example `pnpm dev`) and the not-cloned note (the seeded repo has no clone, so per D1 no Regenerate). No model call. Avoid uppercase labels (INSIGHTS). Owner: test-writer (it alone may edit `flows.md`) | — | `verify.sh run --e2e` (flow 06 must still pass) |
| 32 | server | db · 3a seed | `src/db/seed.ts` (edit) | Insert one `onboarding` row for `acme/payments-api` with a valid five-section `json`, provider/model, tokens, `cost_usd` and `files_indexed` matching the screenshot's spirit, and `limited: false`, using `onConflictDoNothing`. Inline literal JSON (db may not import modules); the shape must pass `Onboarding.safeParse` (the IT test in row 11 reads the seeded row, or a unit test parses an exported fixture constant from `seed.ts`; implementer's choice). Seeded commands must pass the AC-29 rule only in spirit (the seed bypasses verification); keep them plausible. An existing dev DB gets the row on the next `pnpm db:seed` because the table row is new (INSIGHTS 2026-10-06 applies only to changed rows) | drizzle-orm-patterns | row 31 |

## Contracts & migrations

- Contract changes: `Onboarding`, `OnboardingSection`, `OnboardingLink` reshaped; new `OnboardingRun`, `OnboardingView`, `OnboardingDraft` (plus per-kind section schemas) in `server/src/vendor/shared/contracts/knowledge.ts`. Copy the whole file to `client/src/vendor/shared/contracts/knowledge.ts` in row 12, then `git diff --no-index --exit-code server/src/vendor/shared client/src/vendor/shared` (TC-1). Today the two copies are identical. The spec's claim of a drift in that file (AC-53) no longer holds; the copy is still required.
- Migration: new table `onboarding_runs` with the partial unique index `onboarding_runs_one_running_uidx`; `onboarding` gains nullable `run_id`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `files_indexed` and `limited` (default false), via `cd server && pnpm db:generate`, then `pnpm db:migrate`. Columns are only added, so no rename prompt.

## Verification plan

| Package | Commands | Needs Docker |
|---|---|---|
| all touched | `bash .claude/skills/pr-self-review/scripts/verify.sh run --with-it --e2e`, then `verify.sh check` | yes |
| server (while building rows 5, 8, 10) | `cd server && pnpm exec vitest run onboarding-helpers onboarding-service onboarding-routes contracts` | no |
| server (rows 2, 6, 11) | `cd server && pnpm db:generate && pnpm db:migrate` (no redirects; read the SQL with Read), then `pnpm exec vitest run onboarding.it.test` | yes |
| server | `pnpm typecheck && pnpm lint && pnpm lint:arch` | no |
| client | `cd client && pnpm exec vitest run OnboardingTourView TourSections TourSectionCard TourToc TourPathRow TourCommandRow clipboard helpers smoke` (filter by file name, not by the `[repoId]` path), then `pnpm typecheck && pnpm lint` | no |
| contracts | `git diff --no-index --exit-code server/src/vendor/shared client/src/vendor/shared` | no |
| e2e | `cd e2e && npm run e2e:hermetic` (flows 06 and 15); afterwards restart the :3000 dev web (e2e INSIGHTS 2026-10-20) | yes |
| design system | open `/showcase` in both themes and check the new group and the fenced Markdown block | no |

## Risks & open questions

Decided questions (user answers, 2026-10-21):

- Q1 (AC-47, EC-12) Stored tour + no clone → A: show the tour, with a "Repository not cloned yet" note in place of Regenerate (D1). With no tour, the not-cloned state shows with no generate button. A direct POST still answers 422.
- Q2 (AC-28) The indexed file list → A: index membership through `getFileRank` when the index is usable; the default-branch git tree when the tour is limited (D2).
- Q3 (AC-29) Install commands → A: keep the spec's rule. S1 is declined and the spec is not revised. `pnpm install` survives only if it appears verbatim in a read README/compose/Makefile/`.env.example` line.
- Q4 (AC-19, AC-30) A first task with no verified file → A: drop the task (D4). Fewer than 3 tasks after verification are stored as they are; no fallback.

Risks:

- `last_polled_at` also advances on a PR-list refresh (`server/src/modules/polling/routes.ts:62`), so the stale hint appears after any refresh even when the code did not change. This is accepted by the spec (OQ-3); mention it in the PR.
- `getFileRank` returns `[]` when `REPO_INTEL_ENABLED` is off. That case is limited, so the tree fallback applies (D2).
- `MockGitClient.listFiles` / `showFile` behaviour for `**` is unverified (`server/src/adapters/mocks.ts:320-345`). Service tests may need a local fake instead.
- Structured-output providers may reject `z.tuple` / discriminated unions. That is why the model sees `OnboardingDraft` (a plain object) and only the stored contract uses the tuple (TC-3).
- Whether `ValidationError` maps to 422 is unverified (`server/src/platform/errors.ts:25`). Row 10 asserts it; if it does not, use the 422-producing error the conventions route relies on.
- `Workflow` / `Boxes` stand in for the screenshot's nav glyph; adding an icon to `icons.tsx` would be outside the approved design-system scope.
- No external facts are needed (no researcher).

## Decisions taken by default

- D1 (confirmed by the user, Q1 = A) Stored tour + no clone → show the tour; hide Regenerate and show the not-cloned note in its place; with no tour, show the "Repository not cloned yet" state (AC-47). The seeded e2e repo exercises this path.
- D2 (confirmed, Q2 = A) Allowed paths = files read ∪ indexed paths (via `getFileRank` on every candidate path) when not limited; files read ∪ default-branch tree when limited.
- D3 (confirmed with Q3 = A) Command check: trim and strip a leading `$ `; script match for `npm|pnpm|yarn|bun` with an optional `run` (plus `npm start` / `npm test`) against any read `package.json`, with no extra arguments; otherwise the command must equal a trimmed line of a read README/compose/Makefile/`.env.example`. No install allow-list. The prompt tells the model to put comments in `note`.
- D4 (confirmed, Q4 = A) A first task with no verified file is dropped; first tasks are capped at 5; there is no minimum after verification.
- D5 Input files: root README (`README*`, case-insensitive), root and depth-1 manifests (`package.json`, `Makefile`, compose files, `.env.example`) found in the tree, the top 12 ranked files (as in Conventions), then the chain files, in that order until the 60 000 cap.
- D6 `files_indexed` = index `filesIndexed` when not limited, the tree size when limited.
- D7 Section titles are fixed server constants (stored for API consumers); the client renders i18n titles by kind.
- D8 Open-question answers adopted as the coordinator instructed: caps as constants (OQ-2), stale wording in `onboarding.json` with the index `updatedAt` / `last_polled_at` source (OQ-3), first-tasks layout = title, why, file rows with Open (OQ-4), `pre` rendering in `Markdown` (OQ-1).
- D9 The reusable tour pieces live in `client/src/components/tour-*/`, not in `vendor/ui`, so `/showcase` can mount them without widening the design-system scope.

## Handoff

- Architecture review focus: `modules/onboarding/ports.ts` (no import of `repo-intel/types.ts` or other modules); `service.ts` (no `platform/prompts` or `container` import; the prompt comes through deps); `repository.ts` (workspace scoping on `onboarding` through `repos`, transaction in `completeRun`); `container.ts` getter; client placement (tour pieces in `src/components/tour-*`, route depth, `import type` only from `@devdigest/shared`, thin server `page.tsx`); `vendor/ui` changes limited to `nav.ts` and `Markdown.tsx`; `lint:arch` baseline unchanged.
- Security review focus: prompt assembly in `onboarding/helpers.ts` (`<untrusted source>` attribute escaping, the tree and chains inside data blocks); paths read only from the git tree or index at the default branch via `showFile`, never `readFile`; path and command verification (AC-28/29, D2/D3); Markdown rendering without raw HTML, and `a` hrefs from model text (react-markdown's default URL sanitising); Open URLs built client-side from verified paths with `noopener,noreferrer`; commands only copied (AC-52); logs carry no file content or secrets; the provider error text stored in `onboarding_runs.error` is shown in the banner (check it cannot hold a key).
- plan-verifier: re-run rows 5 and 8 (helpers and service tests) for AC-24 and AC-28–AC-35 (incl. D2–D4); row 11 IT for AC-33, AC-51, AC-54; row 18 for AC-3/AC-4; row 28 for D1; TC-1 contract diff; e2e 06 + 15.
- doc-writer (after review): `server/specs/` and README API map for the two routes and the tables, `client/specs/pages.md` row for `/repos/[repoId]/tour`, and set the `specs/onboarding-tour.md` status per the user's call. The `e2e/specs/flows.md` section belongs to test-writer (row 31).
