# DevDigest — architecture improvement plan

Date: 2026-11-24 · Scope: `client/`, `server/`, `reviewer-core/`, DB schema, tests/CI.
Method: the codebase was checked against the repo's own skills —
`frontend-ui-architecture`, `react-best-practices`, `next-best-practices` (client);
`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`,
`postgresql-table-design`, `zod` (server/DB); `security`, `typescript-expert` (cross-cutting).
Every finding below has file evidence; counts come from greps on this date.

**Overall:** the codebase is in good shape where it matters most — `reviewer-core` is a clean pure
core, the API has real local-only hardening (host/origin guard, helmet, rate limit, CSP on the
web app), routes validate with Zod, and the client already follows "page composes, logic in
`_components`, data via `lib/hooks`". The gaps are mostly **enforcement** (no linter anywhere),
**drift** (vendored contracts, i18n rule), and **legacy layering** on the server (already
inventoried by `onion-architecture`).

Priority: **P1** = do next, cheap and protects everything else · **P2** = planned refactors ·
**P3** = nice to have / needs a decision first.

---

## 0. Before anything: land what is already done

| # | Item | Evidence |
|---|---|---|
| 0.1 | Commit the uncommitted architecture work: server dependency-cruiser gate + baseline, `onion-architecture` and `frontend-ui-architecture` skills, research docs, CLAUDE.md/TESTING.md edits. Until then the server architecture test exists only in this working copy. | `git status`: `server/.dependency-cruiser.cjs`, `server/.dependency-cruiser-known-violations.json`, `server/test/architecture.test.ts` untracked |

## 1. Cross-cutting

| # | P | Finding | Action | Skill / rule |
|---|---|---|---|---|
| X1 | P1 | **No ESLint in any package.** Rules that CLAUDE.md and the skills rely on are review-only. A stray `// eslint-disable-next-line react-hooks/exhaustive-deps` exists with no ESLint to honour it (`client/.../ReviewRunAccordion/ReviewRunAccordion.tsx:52`). | Add flat-config ESLint per package + a `lint` step in each CI workflow. Start with a small, high-value set (see X1a–c), warnings off, errors only. | frontend-ui-architecture `references/enforcement.md`; typescript-expert |
| X1a | P1 | Server: an un-awaited promise once crashed the whole API (server/INSIGHTS.md, JobRunner). | `@typescript-eslint/no-floating-promises`, `no-misused-promises` in `server/` and `reviewer-core/`. | security, fastify-best-practices |
| X1b | P1 | Client: runtime import from `@devdigest/shared` 500s the Next build (client/INSIGHTS.md). | `no-restricted-imports` with `allowTypeImports` for `@devdigest/shared`; `consistent-type-imports`. | frontend-ui-architecture |
| X1c | P1 | Client: hooks rules unchecked. | `eslint-plugin-react-hooks` (rules-of-hooks + exhaustive-deps); `import/no-restricted-paths` zones `lib ↛ components ↛ app`; `import/no-cycle`. | react-best-practices, frontend-ui-architecture |
| X2 | P1 | **Vendored contracts have drifted:** 5 files differ between `server/src/vendor/shared` and `client/src/vendor/shared` (`adapters.ts`, `contracts/{eval-ci,knowledge,productionize,trace}.ts`). Client/CLAUDE.md already lists known gaps (`openrouter`, `commitFiles`, …). | (a) Sync now, server → client, one PR. (b) Add a CI check that fails when the two trees differ (a `diff -r` script in `client.yml`), or (c) longer term, a real shared package — ADR. | zod; typescript-expert (Pocock rule 3, see skill README) |

## 2. Client (Next.js 15 / React 19)

| # | P | Finding | Action | Skill / rule |
|---|---|---|---|---|
| C1 | P1 | **Hardcoded UI strings** despite the "no literal text" rule — ~15 sites, e.g. `app/page.tsx:23,33`, `pulls/[number]/page.tsx:115`, `FindingsTab.tsx:151`, `ReviewRunAccordion.tsx:117-118`, `AgentCard.tsx:47-48`, `agents/[id]/page.tsx:45`, `AddRepoView.tsx:74,77,94`, `CodeLine.tsx:49-50`. | Move to `messages/en/*.json`; shared components (`diff-viewer`) get strings via props. Add `eslint-plugin-i18next`/`react/jsx-no-literals` once X1 lands. | client/CLAUDE.md; frontend-ui-architecture (shared components take translated props) |
| C2 | P1 | **No `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` anywhere.** A render error in any route blanks the app; unknown URLs get Next's default 404. | Add root `app/error.tsx` (+ `global-error.tsx`) using `ErrorState` from `@devdigest/ui`, root `not-found.tsx`; consider `loading.tsx` for heavy routes. | next-best-practices → error-handling |
| C3 | P2 | **Effects used for derived/synced state** (react.dev "You Might Not Need an Effect"): `ConfigTab.tsx:29` copies 8 agent fields into `useState` on every `agent` change (server data copied into local state); `FindingsPanel.tsx:44` resets focus in an effect when filters change; `ReviewRunAccordion.tsx:47` opens/scrolls on a nonce with deps suppressed. | ConfigTab: mount the form with `key={agent.id}` and initialize state from props (or one `useReducer`); FindingsPanel: reset focus in the filter change handlers; accordion: drive from an event, not a nonce effect. | react-best-practices "Derive, don't store", "useEffect rules" |
| C4 | P2 | **Fat client pages + deep relative imports.** `pulls/[number]/page.tsx` 185 lines (8 data hooks, tab state, run tracking), `pulls/page.tsx` 135, `agents/[id]/page.tsx` 124, `app/page.tsx`; 30 files import via `../../../`. | Same pattern as `app/agents/page.tsx`: page renders one `<XView/>` from `_components`; switch to `@/` alias. Mechanical, one route per PR. | frontend-ui-architecture (thin page, imports) |
| C5 | P2 | **Index keys on data lists:** `DiffViewer.tsx:28` (files), `TraceBody.tsx:102` (tool calls), `FileCard.tsx:83`, `PromptModalBody.tsx:66`. Diff files can be filtered/reordered → state (open/comment drafts) jumps between files. | Key by `filename`, tool-call id/index+name, line number. Skeleton/`mark` index keys are fine. | react-best-practices "Key prop patterns" |
| C6 | P2 | **Query keys typed inline** — 33 `queryKey:` literals across `lib/hooks/*`, repeated again in `invalidateQueries`; `lib/hooks/index.ts` is an `export *` barrel. | Introduce `queryOptions` factories per domain file, reuse their `.queryKey` for invalidation; import new hooks from domain files. One file per PR (start with `reviews.ts`). | frontend-ui-architecture `data-and-logic.md`; TanStack S49/S50 |
| C7 | P2 | **No runtime validation at the API boundary.** `api.get<T>` is a cast; SSE events are `JSON.parse(ev.data) as RunEvent` (`lib/hooks/reviews.ts:184`). A server/client contract mismatch (see X2) surfaces as undefined-field bugs deep in UI. | Parse SSE events and persisted-JSON responses with the contract's Zod schema inside the hook; invalid → query `error`. Start with `RunEvent`. | zod (parse at boundaries); frontend-ui-architecture |
| C8 | P3 | **Dead code:** `components/showcase` (259 lines, largest client file) is referenced only by `test/smoke.test.tsx`. | Delete, or move to a dev-only route if the team uses it as a UI catalog. Run Knip once to find more. | frontend-ui-architecture (Knip) |
| C9 | P3 | **Domain components in `components/`** (`diff-viewer`, `run-cost-badge`). Accepted by the skill today (`vendor/ui` is the real shared layer). | Revisit with an ADR on `src/features/<domain>/` when reviews UI grows further. | frontend-ui-architecture `structure.md` |
| C10 | P3 | All pages are client-rendered; data via TanStack Query → Fastify. Valid under Next's "External HTTP API" model. | Decide via ADR whether any route benefits from SSR prefetch + `HydrationBoundary`; until then, no change. | next-best-practices data-patterns; skill `nextjs.md` |

Already good (keep): CSP + security headers in `next.config.mjs`; root `<Suspense>` covers `useSearchParams`; icon buttons carry `aria-label`; no `fetch` in components; colocated tests and helpers.

## 3. Server (Fastify 5 / Drizzle)

The `onion-architecture` skill already holds the authoritative inventory and migration order
(`references/migration.md`); this plan only schedules it.

| # | P | Finding | Action | Skill / rule |
|---|---|---|---|---|
| S1 | P1→P2 | **23 frozen layering violations** in the depcruise baseline: 15 Drizzle-outside-infrastructure, 5 cycles (`container ⇄ repo-intel`, `agents/helpers ⇄ repository`), 2 adapters → modules, 1 cross-module import. | Migrate one module per PR in the skill's order: `agents` (pilot) → `settings`/`workspace`/`polling`/`pulls` → `repos` → `repo-intel` → `reviews`. Baseline may only shrink. | onion-architecture |
| S2 | P1 | `agents/repository.ts` writes agent + version snapshot **without a transaction** and decides the version bump inside the repository. | Fix first as part of the `agents` pilot (UoW + domain policy). Real data-integrity risk, not just style. | onion-architecture; drizzle-orm-patterns (transactions) |
| S3 | P1 | `workspace/routes.ts` is the only routes file without the Zod type provider. | Add params/body/response schemas. | fastify-best-practices; zod |
| S4 | P2 | **Oversized modules:** `repo-intel/service.ts` 765 lines, `repo-intel/repository.ts` 618, `reviews/run-executor.ts` 467, `pulls/routes.ts` 345 (route talks to DB, no service), `adapters/astgrep/index.ts` 641. | Split along use cases during the S1 migration of each module, not separately. | onion-architecture |
| S5 | P2 | `AppError.statusCode` lives in `platform/errors.ts` and is thrown from inner code. | Domain errors with codes + one code→status map in `app.ts` (last step of S1). | onion-architecture; fastify-best-practices (error handler) |
| S6 | P3 | 2 `any` casts in `server/src`. | Remove when touching those files. | typescript-expert |

Already good: host/origin guard for the unauthenticated local API, helmet, CORS allow-list, rate limit, body limit, readiness probe, stale-run reaper awaited before listen, Zod type provider + error envelope.

## 4. Database (Postgres 16)

| # | P | Finding | Action | Skill / rule |
|---|---|---|---|---|
| D1 | P2 | **51 foreign keys vs 15 index definitions.** Postgres does not index FK columns automatically; joins and `ON DELETE CASCADE` (49 `onDelete`) scan child tables. | Run an FK-without-index query against the dev DB, add indexes for columns used in lookups/cascades (runs, findings, reviews, repo-intel children first) in one migration. | postgresql-table-design (index FKs) |
| D2 | P3 | Money stored as `doublePrecision` (`cost_usd` in `runs`, `ci`, `eval`). Sums of float costs drift. | Switch to `numeric(12,6)` when cost aggregation matters (per-PR totals already shown in UI). Coordinate with contracts (string vs number). | postgresql-table-design |

## 5. reviewer-core

Healthy: ~1,000 lines, pure (LLM behind `LLMProvider`), Zod structured output, end-to-end
pipeline test (`test/run.test.ts` covers assemble → structured → reduce → grounding).

| # | P | Finding | Action |
|---|---|---|---|
| R1 | P3 | `review/reduce.ts` and `grounding.ts` are tested only through the pipeline test. | Add table-driven unit tests for edge cases (dedupe, severity ordering, line-range grounding) — cheap, and they document the rules. |
| R2 | P1 | Covered by X1a — floating-promise lint matters here too (LLM calls). | — |

## 6. Tests & CI

| # | P | Finding | Action |
|---|---|---|---|
| T1 | P1 | No lint job in any of the 5 workflows. | Add after X1; keep it fast and blocking. |
| T2 | P2 | Client tests (14 files) cover components; `lib/api.ts` error normalization and the `lib/hooks` layer (polling, invalidation, SSE) have no tests. | Hook tests with a QueryClient wrapper + mocked fetch; `ApiError` mapping tests. (react-testing-library skill) |
| T3 | P2 | Contract drift is not detected by CI (see X2). | Add the vendor diff check to `client.yml`. |

---

## Suggested order (PR-sized)

1. **Commit** pending architecture work (0.1).
2. **ESLint baseline** for server + reviewer-core (X1a) and client (X1b, X1c) + CI lint step (T1).
3. **Contracts sync + drift check** (X2, T3).
4. **Client safety net:** `error.tsx` / `global-error.tsx` / `not-found.tsx` (C2); i18n sweep (C1); `workspace` Zod schemas (S3).
5. **Onion pilot: `agents`** — fixes the missing transaction (S2) and shrinks the baseline (S1).
6. **Client cleanups**, one route/file per PR: effects (C3), thin pages + `@/` imports (C4), keys (C5), `queryOptions` (C6), SSE validation (C7).
7. **DB FK indexes** (D1).
8. Continue onion migration module by module (S1, S4, S5).
9. Decisions needing an ADR: `features/` layer (C9), SSR prefetch (C10), shared contracts package (X2c), money type (D2).
