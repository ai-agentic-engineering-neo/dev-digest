# DevDigest — improvement plan

Audit date: 2026-11-25 · branch `lecture-02/task-1` · all four packages.
Lenses (project skills): `frontend-architecture`, `onion-architecture`, `react-best-practices`,
`next-best-practices`, `fastify-best-practices`, `security`. Every item cites the evidence
(file → symbol) and the rule it is measured against.

Priority: **P0** = safety net, cheap, unblocks the rest · **P1** = real architectural debt ·
**P2** = target architecture / nice to have. Effort: S (< ½ day) · M (1–2 days) · L (3+ days).

---

## Progress

| Item | Status (2026-11-25) |
|---|---|
| P0-1 ESLint in client | ✅ `client/eslint.config.mjs`, `pnpm lint`, step in `client.yml`. 0 errors. 56 warnings left (40 deep imports → F4, plus index keys in static lists and `vendor/ui`). `next build` does not lint (`eslint.ignoreDuringBuilds`) |
| P0-2 contract copies | ✅ client copy synced from the server (additions only). `scripts/check-contracts.sh` + `contracts.yml` fail on any drift |
| P0-3 `RunRequest.parse` in route | ⏭ kept on purpose: the route comment documents a tolerant parse (empty body allowed). `schema.body` would reject an empty POST |
| P0-3 index keys | ✅ `DiffViewer` keyed by `file.path` (`FileCard` holds open/closed state). Static lists (diff lines, `specs_read`, `tool_calls`) keep index keys: they never reorder and have no id |
| P0-3 i18n | ✅ `messages/en/addRepo.json`, `messages/en/home.json`. Same English text. New `AddRepoView.test.tsx` |
| P0-3 hex colors | ✅ dead hex fallbacks removed from `lib/toast.tsx`. ⏸ `MODEL_COLOR` needs a design decision: no token for `#8b5cf6`, and the light theme redefines `--accent`/`--ok`/`--warn`, so switching would change how the chips look |
| P0-3 `any` in server | ❌ false positive: both hits were the word "any" in comments. There are no `any` types |
| B1 `pulls/routes.ts` | ⚠ uncommitted work in progress from another session touches `server/src/modules/pulls/*`. Left untouched here |
| F4 deep imports | ✅ codemod: 47 specifiers in 24 files → `@/`. `no-restricted-imports` is now an **error** |
| F2 query keys | ✅ `lib/hooks/keys.ts` (exact old arrays, pinned by `keys.test.ts`), `useInvalidatePrRuns` for the PR page |
| F3 state/effects | ✅ `ConfigTab`: one form object + `key={agent.id}` instead of 9 `useState` + a reset effect. `FindingsPanel`: focus reset in the handlers. `ReviewRunAccordion` effect kept (scroll is a DOM sync) |
| F1 thin pages | ✅ pages moved to `_components/<Name>View`. Each `page.tsx` is a server component with `generateMetadata`. Title template + `noindex` in the root layout. `app/error.tsx` + `app/not-found.tsx` (real 404). Checked on `next start` |
| F5 tests | 🟡 added for `AddRepoView`, `ConfigTab`, `HomeView`, `NotFoundView`, `FilterBar`, `CreateAgentModal` (this one found and fixed an unhandled rejection). Still missing: `AgentsListView`, `SettingsView` (+2 sections), `FindingsTab`, `PrDetailHeader`, `ReviewRunAccordion`, `OverviewTab`, `DiffTab`, 6 `RunTraceDrawer` parts, the 4 new `*View` route bodies |
| F6 split big components | ⏳ not started |
| B1 settings + workspace | ✅ Drizzle moved into `SettingsRepository` / `WorkspaceRepository`. Thin services. `feature-models.ts` reads through the repository. `polling` left alone (overlaps the pulls WIP) |
| B2 response schemas | 🟡 `secrets-status`, `test-connection`. `GET/PUT /settings` skipped on purpose: the `Settings` contract has `.default()`s the serializer would inject. Other modules not done |
| B3 explicit deps | 🟡 `AgentsService({ repo, llm })`. `reviews`, `repos` and `repo-intel` services still take `Container` |
| B4 Drizzle in application | 🟡 queries gone from `settings`. Left: `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts` use **row types** (not queries), so the fix is repositories returning DTOs (module migration) |
| B5 transactions | ✅ verified and fixed: review + findings were two separate inserts. Now `insertReviewWithFindings` in one transaction. The rollback test fails without it |
| B6 split god files | ⏳ not started (L, high risk) |
| B7 ports | ✅ `modules/repo-intel/ports.ts` owns `DepGraph`/`FileEdge`/`Tokenizer` + adapter constants. Adapters import only it. `repos` goes through the repo-intel facade. Dependency-rule template: 34 → 20 errors |
| B8 enforcement | ⏳ blocked: (1) the pulls WIP is uncommitted. (2) The template's `routes-no-data-access` rule flags module wiring in `routes.ts`, which `onion-architecture` §6 prescribes. Resolve that conflict first |

---

## Summary

| Area | State | Biggest gap |
|---|---|---|
| Security | Good: helmet, CORS allowlist + origin check, global rate limit, 1 MB body limit, ripgrep flag-injection hardening, `Markdown` renders no `<img>`, git env allowlist | No HIGH-confidence finding in what was checked |
| Contracts | **Drifting**: 5 of the shared files differ between server and client, some functionally | Client `Provider` enum lacks `openrouter` |
| Tooling | **No linter in any package**. `eslint-disable` comments in client code point at a linter that doesn't exist | Hook rules and import rules are unenforced |
| Backend architecture | Mostly layered. A recorded baseline of 34 dependency-rule errors + 5 cycles (`onion-architecture` §14) | Services take `Container`, Drizzle leaks into routes and services, files over 600 lines |
| Frontend architecture | Clean component-folder anatomy, data only through hooks | Client-only pages without `metadata`/error boundaries, mirrored form state, deep relative imports |
| Tests | server 30 unit + 7 integration, reviewer-core 3, e2e 7 flows, client tests in most folders | 19 `_components` folders have no test (convention says each has one) |

---

## P0 — safety nets (do first)

### P0-1 · Add ESLint to `client` (M)
- **Evidence:** there is no ESLint, Biome or Prettier config in any package, and `client/package.json` has no `lint` script. Yet `ConfigTab.tsx` and `ReviewRunAccordion.tsx` carry `eslint-disable react-hooks/exhaustive-deps`, which suppress nothing.
- **Why:** `react-best-practices` (hooks rules) and `frontend-architecture` §9 (imports) are only advice without a linter.
- **Do:** flat config with `eslint-config-next` (includes `react-hooks`), `import/order`, `import/no-cycle`, `no-restricted-imports` (ban `@devdigest/ui/*` deep imports and `../../../` chains), and `react/no-array-index-key` as a warning. Add a `lint` step to `.github/workflows/client.yml`. Start with warnings and fix them before switching to errors.

### P0-2 · Re-sync the two Zod contract copies and guard against drift (M)
- **Evidence:** `diff -rq server/src/vendor/shared client/src/vendor/shared` shows 5 files differ:
  - `adapters.ts`: the client `LLMProvider.id` is `'openai' | 'anthropic'`, while the server also has `'openrouter'`. `CommitFile` and `sessionId` are missing on the client.
  - `contracts/productionize.ts`: the `provider` enum lacks `openrouter` on the client.
  - `contracts/knowledge.ts`: `AgentVersionConfig` is missing on the client.
  - `contracts/eval-ci.ts`: `AgentManifest` is missing on the client.
  - `contracts/trace.ts`: comments only.
  
  The client UI does send `provider: "openrouter"` (`SettingsModels.tsx` → `feature_models`), so the client types are already wrong.
- **Why:** root `AGENTS.md` (*update both copies*) and `onion-architecture` §7.
- **Do:** (1) copy server → client for the 4 functional diffs and run `pnpm typecheck` in client. (2) Add `scripts/check-contracts.sh` that diffs the two folders ignoring comment-only lines, and run it in both `server-unit.yml` and `client.yml`. (3) P2 option: generate the client copy from the server copy, so there is a single source of truth.

### P0-3 · Quick rule fixes (S each)
| Fix | Evidence | Rule |
|---|---|---|
| Move `RunRequest.parse(req.body)` into the route `schema.body` | `server/src/modules/reviews/routes.ts:32` | `server/AGENTS.md`: no manual parse in handlers |
| Stable keys instead of the index on dynamic lists | `components/diff-viewer/DiffViewer/DiffViewer.tsx` (`key={i}` on files → `file.path`), `FileCard.tsx`, `TraceBody.tsx` (`tool_calls`) | `react-best-practices` Key Props |
| Move hard-coded English into `messages/` | `app/onboarding/_components/AddRepoView/AddRepoView.tsx` ("Add a repository"), `app/page.tsx` ("Welcome to DevDigest", subtitle, crumb) | `client/AGENTS.md`: UI text in `messages/` |
| Replace hex colors with CSS variables | `app/agents/_components/AgentCard/constants.ts` → `MODEL_COLOR`; hex fallbacks in `lib/toast.tsx` | `client/AGENTS.md`: no hard-coded colors (open question in `client/INSIGHTS.md`) |
| ~~Remove the 2 `any`s~~ (false positive, see Progress) | `server/src` | `typescript-expert` |

---

## P1 — frontend (`client/`)

### F1 · Thin route files with metadata and error boundaries (M)
- **Evidence:**
  - Every dynamic `page.tsx` is `'use client'`: `app/page.tsx`, `onboarding/page.tsx`, `repos/[repoId]/pulls/page.tsx`, `pulls/[number]/page.tsx`, `agents/[id]/page.tsx`. Overall, 36 of 40 `.tsx` files in `app/` are client files.
  - `pulls/[number]/page.tsx` is 185 lines. It calls about 9 hooks, holds the invalidation logic with inline query keys, and imports via `../../../../../`.
  - There is no `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere in `app/`.
  - Only the root `layout.tsx` exports `metadata`, and a client page *cannot* export it.
- **Why:** `frontend-architecture` §2/§6/§12, `next-best-practices` (error-handling, metadata, rsc-boundaries).
- **Do:** for each route:
  - Make `page.tsx` a **server** component: about 10 lines that export `metadata` (unique `title`) and render a client `<XView />` from `_components/`.
  - Move the PR detail logic into `_components/PrDetailView/usePrDetail.ts`.
  - Add a root `error.tsx` + `not-found.tsx` and one `error.tsx` for `repos/[repoId]/pulls/[number]`.
  - Add `robots: { index: false }` in the root metadata (private, local-first app).

### F2 · Query key factories (S)
- **Evidence:** `pulls/[number]/page.tsx:52,57` invalidate the raw keys `["pr-active-runs", prId]` and `["pr-runs", prId]`, which are defined again in `lib/hooks/reviews.ts`.
- **Why:** `frontend-architecture` §11 (stable keys, targeted invalidation).
- **Do:** add `reviewKeys` / `pullKeys` factories in each `lib/hooks/<domain>.ts`, and expose `useInvalidateRun(prId)` instead of `queryClient` calls in pages.

### F3 · State and effect hygiene (S–M)
| Where | Problem | Fix |
|---|---|---|
| `agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx` | 9 `useState`s copied from `agent` plus a reset effect with the deps lint disabled | Render with `key={agent.id}` (React resets the state) and keep one form state (`useReducer` or a single object) |
| `pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:46` | `useEffect(() => setFocusIdx(0), [hideLow, severity])` resets state from an effect | Reset in the filter change handlers |
| `pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:47` | Effect with suppressed deps opens and scrolls on a nonce | Keep the scroll in the effect (DOM sync is legitimate), derive `open` from `targetRunId` and fix the deps |
| `app/page.tsx:15` | Redirect from an effect after the client fetch | Acceptable for now. Revisit with F1 |
- **Why:** `frontend-architecture` §10, `react-best-practices` (Derive, Don't Store; useEffect rules).
- **Not a problem:** `AddRepoView` (Escape listener with cleanup) and `RunStatus` (ref plus a callback on a transition) are legitimate effects.

### F4 · Imports (S, codemod)
- **Evidence:** 30 files import via `../../../` or deeper (`grep -rlE 'from "(\.\./){3,}' client/src`) despite the `@/*` alias. Example: `AgentCard.tsx` → `../../../../lib/hooks/agents`.
- **Do:** run a codemod to `@/…` and lock it with the P0-1 lint rule. New code imports from domain hook files, not the `lib/hooks/index.ts` `export *` barrel.

### F5 · Test gaps (M)
- **Evidence:** 19 component folders have no `*.test.tsx`, including `AgentsListView`, `AddRepoView`, `SettingsView`, `FilterBar`, `CreateAgentModal`, `FindingsTab`, `PrDetailHeader`, `ReviewRunAccordion`, `OverviewTab`, `DiffTab`, `ConfigTab`, and 6 `RunTraceDrawer` sub-components.
- **Do:** cover the stateful ones first (`ConfigTab`, `FilterBar`, `CreateAgentModal`, `ReviewRunAccordion`). Use the `react-testing-library` skill.

### F6 · Split the largest components (M)
- `RunHistory.tsx` (235 lines), `FindingsTab.tsx` (172), `ReviewRunAccordion.tsx` (165): move logic into hooks and rules into `helpers.ts` (`frontend-architecture` §3, under about 200 lines and about 7 props).

---

## P1 — backend (`server/`, `reviewer-core/`)

Baseline: a `depcruise` run of `.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs`
on 2026-11-25 reported **34 errors + 5 circular warnings**. Fix module by module, smallest first.
Don't mass-refactor inside feature PRs.

### B1 · Drizzle out of routes (S–M, start here)
- **Evidence:** `pulls/routes.ts` (`costByPr`), `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` import `drizzle-orm`.
- **Do:** add intent-named repository methods (`sumCostByPr(prIds, workspaceId)`). Handlers become schema → `getContext` → one service call (`onion-architecture` §6).

### B2 · Response schemas on every route (S–M)
- **Evidence:** `settings/routes.ts` has 5 routes but only `PUT /settings` has a `schema`. `GET /settings` and `GET /settings/secrets-status` have none.
- **Why:** `fastify-best-practices` (schemas, serialization): response schemas both speed up serialization and stop accidental field leaks.
- **Do:** add `schema.response[200]` from the Zod contracts to every route, starting with settings and agents.

### B3 · Explicit service dependencies (M per module)
- **Evidence:** `reviews/service.ts`, `agents/service.ts`, `repos/service.ts` and `repo-intel/service.ts` take `Container` and build their own repositories. `reviews/service.ts` imports `db/rows` (`AgentRow`).
- **Do:** `new XService({ repo, github, … })` wired in the module plugin body. Map rows in the repository (`onion-architecture` §8/§10). Services then unit-test without Docker.

### B4 · Drizzle out of application code (M)
- **Evidence:** `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`, `settings/feature-models.ts`.
- **Do:** move the queries into `repository.ts` / `repository/*.repo.ts`.

### B5 · Transactions for multi-table writes (M, verify first)
- **Evidence:** there is no `.transaction(` call anywhere in `server/src`. Review persistence (run + review + findings) writes several tables.
- **Do:** check which use cases write ≥2 tables. For those, add a `UnitOfWork` port implemented with `db.transaction` (`onion-architecture` §8). A crash mid-write currently leaves partial rows. This is unverified until the audit is done.

### B6 · Split god files (L)
- **Evidence:** `modules/repo-intel/service.ts` (765 lines), `repo-intel/repository.ts` (618), `adapters/astgrep/index.ts` (641), `reviews/run-executor.ts` (437), `adapters/github/octokit.ts` (372).
- **Do:** split by use case (`index-full`, `index-incremental`, `query-context`), and let the `pipeline/` folder own the steps. This also breaks the cycles: `repo-intel/service.ts` ↔ `pipeline/*`.

### B7 · Ports and adapters direction (M)
- **Evidence:**
  - Ports are declared inside adapters: `adapters/depgraph/index.ts` (`DepGraph`), `adapters/tokenizer/index.ts` (`Tokenizer`).
  - Adapters import `modules/repo-intel/constants`: `astgrep`, `depgraph`.
  - `repo-intel/service.ts` imports concrete adapters.
  - `repos/service.ts` reaches into `repo-intel/constants`.
- **Do:** move the ports to the consumer (`modules/repo-intel/ports.ts`), pass constants as arguments, and go through the facade (`onion-architecture` §5).

### B8 · Wire dependency enforcement (S, after B1–B4)
- Generate a baseline of known violations, then add `depcruise --validate` to `server-unit.yml`, as `onion-architecture` §13 describes. Same for client boundaries once F4 lands.

### reviewer-core
- Clean: no `fs`/`fastify`/`drizzle`/server imports, a single public `index.ts`, SDK usage confined to `src/llm/`. Only 3 test files for the engine everything depends on, so add tests for `grounding.ts` edge cases and `review/reduce.ts` (P2, S).

---

## P2 — target architecture and polish

- ~~**T1 · `features/` + `shared/` layout in client**~~ — dropped (2026-11-25): skills are guidance only, never a migration. `frontend-architecture` §13 now maps §2's terms onto the existing route-colocated layout, so no code has to move.
- **T2 · Styling decision.** The stack lists Tailwind 4, but components use `styles.ts` style objects and inline `style={}`. Pick one, write it in `client/AGENTS.md`, and stop mixing (`react-best-practices` Tailwind section vs the current convention).
- **T3 · Move ports out of `@devdigest/shared`** (`vendor/shared/adapters.ts`) into `server/src/application/ports/`. This is a separate migration (`onion-architecture` §5).
- **T4 · SEO**, only if anything is ever public (landing, docs): full `frontend-architecture` §12 (`robots.ts`, `sitemap.ts`, canonical, OG, JSON-LD). App screens stay `noindex`.
- **T5 · Single contract package.** Generate the client copy from the server copy, or adopt a pnpm workspace for `shared` only. This removes P0-2 at the root.

---

## Suggested order

| Phase | Items | Outcome |
|---|---|---|
| 0 · 1–2 days | P0-1, P0-2, P0-3 | Linter + contract guard in CI, obvious bugs gone |
| 1 · ~1 week | F1, F2, F3, F4, B1, B2 | Thin pages with metadata and error boundaries, fewer re-renders, no Drizzle in routes, response schemas |
| 2 · ~2 weeks | B3, B4, B5, B7, F5, F6 | Services testable without Docker, atomic writes, tests where state lives |
| 3 · ongoing | B6, B8, T1–T5 | Enforced boundaries, `features/` layout, single contract source |

## Out of scope / not verified
- Not a full security review: checked HTTP hardening, process spawning and env/secret reads only. Run `/security-review` before a public deployment.
- Bundle size and runtime performance were not measured.
- B5 (atomicity) needs a code read of the review persistence path before acting.
