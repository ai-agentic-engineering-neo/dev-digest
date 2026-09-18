# 04-tasks-conventions-extractor.md

Source spec: [`04-spec-conventions-extractor.md`](./04-spec-conventions-extractor.md). Depends on spec 01 (skills library) and spec 02 (agent binding). Follow-on spec 05 (API Contract Reviewer) is **out of scope**.

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocated `_components/<Name>/`; tests beside source; `*.it.test.ts` = Postgres; Zod schema+type same name; snake_case REST; `feat:` commits; do-not-touch `vendor/`, applied migrations, lockfiles | none — spec already grants NAV exception + shared-contract SoT in `server/src/vendor/shared` |
| `README.md` | yes | Studio = client `:3000` + server `:3001`; `./scripts/dev.sh` for local stack; L02 = skills + conventions extractor | none |
| `server/AGENTS.md` | yes | Module slice `routes.ts` → `service.ts` → `repository.ts`; register in `modules/index.ts`; `pnpm db:generate` for new migrations; hermetic vs `.it.test` | none |
| `client/AGENTS.md` | yes | Thin `page.tsx`; all API via `src/lib/hooks/*`; `pnpm test` mocks `fetch` | none |
| `reviewer-core/AGENTS.md` | yes | Engine stays ignorant of DB; do not change unless a bug is found | none — spec forbids touching `reviewer-core` |
| `TESTING.md` | yes | Behaviour at seams; one real Postgres integration per data-backed workflow; mock LLM/git; live LLM is not a CI gate | none |
| `.github/workflows/server-unit.yml`, `server-integration.yml`, `client.yml` | yes | CI: `pnpm typecheck` + hermetic vitest; integration job runs `*.it.test.ts` with Docker | none |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| `.pre-commit-config.yaml` | not found | — | — |
| `server/package.json`, `client/package.json` | yes | `typecheck`, `lint`, `test`; server `db:generate` / `db:migrate` / `db:seed` | none |
| `server/eslint.config.js`, `client/eslint.config.mjs` | yes | ESLint per package (`pnpm lint`); both ignore `src/vendor/**` | NAV edit in vendored `nav.ts` is an **explicit spec exception** (same as spec 01) |
| `server/INSIGHTS.md` | yes | Optional Fastify bodies need `.nullish()` not `.optional()`; `skills.insert`+version snapshot must be in `this.db.transaction` | compose must go through `SkillsService` (transactional insert), not a raw conventions-repo insert into `skills` |
| `client/INSIGHTS.md` | yes | `repoBlobUrl` already builds GitHub/GitLab file+line links — reuse, do not reimplement | none |

**Assumptions (spec open questions, not blocking):**

1. Assembled skill preamble wording is an implementation detail as long as it tells the reviewer to flag violations and cite `file:line`.
2. `category` is **free text** from the model, slugified for `##` headings (not a closed enum). Ugly slugs do not need a new spec.
3. Evidence blob links use `repoBlobUrl` with `default_branch` unless a commit SHA is already on the repo DTO.
4. Spec 05 (API Contract Reviewer) does not block this work. No new agent is created here.
5. `POST /repos/:id/conventions/extract` has no required body — schema must be `.nullish()` (empty POST must not 422).
6. Compose endpoint is `POST /repos/:id/conventions/skills`. It verifies every id is `accepted` + same repo, creates via `SkillsService` with `source: 'extracted'` (repository union already allows it; `SkillsService.create` currently hard-codes `manual`), then optionally `AgentsService.linkSkill` (append, never `setSkills` replace).
7. Subtitle metadata (`extracted_at`, `sample_file_count`) must survive reload. Persist two columns on `repos` (`conventions_extracted_at`, `conventions_sample_count`). Do not add a conventions-runs table.
8. Selection of accepted cards is **client-only** until compose; Deselect all does not PATCH `status`.
9. Do not call a model to pick files. Sampling = closed list of config basenames tried via `GitClient.readFile` (`eslint` / `tsconfig` / `prettier` variants at repo root) + `repoIntel.getConventionSamples(repoId, 12)`. Ignore `ConventionFileSelection`. Missing configs are skipped, not errors.
10. Quality levers beyond sampling + evidence gate are design notes only — no confidence-filter UI, no category grouping, no second model pass.
11. `GET /repos/:id/conventions` returns `{ items, extracted_at, sample_file_count }` (`ConventionList`), not a bare array.
12. Display token count copies `Math.ceil(text.length / 4)` into the conventions colocated `helpers.ts`. Do not import `RunTraceDrawer/helpers.ts` across routes.
13. NAV icon: existing `ListChecks` (already in `client/src/vendor/ui/icons.tsx`). Shortcut `g c` optional; do not add Global sidebar items from the mockup.

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/vendor/shared/contracts/knowledge.ts` | SoT: extend `ConventionCandidate`; add `ConventionStatus`, `ConventionList`, compose/patch bodies |
| `client/src/vendor/shared/contracts/knowledge.ts` | Required mirror (house pattern; not a second design) |
| `server/src/vendor/shared/index.ts` | Re-export new contracts if the barrel lists them |
| `client/src/vendor/shared/index.ts` | Mirror barrel |
| `server/src/db/schema/knowledge.ts` | Additive columns on existing `conventions` table |
| `server/src/db/schema/repos.ts` | `conventionsExtractedAt`, `conventionsSampleCount` for subtitle reload |
| `server/src/db/migrations/` | **New** file from `pnpm db:generate` only — never edit applied SQL |
| `server/test/contracts.test.ts` | Parse `ConventionCandidate` / `ConventionList` / `ConventionStatus` |
| `server/src/modules/conventions/helpers.ts` | **New** — path safety, snippet-in-range gate, pending-dedupe key, category slug, skill-body assembler |
| `server/src/modules/conventions/helpers.test.ts` | **New** — hermetic grounding, traversal, re-scan matching, body assembler |
| `server/src/modules/conventions/constants.ts` | **New** — config basename list, sample N=12, extract structured schema name |
| `server/src/modules/conventions/repository.ts` | **New** — list/insert/deletePending/patch; never touches `skills` |
| `server/src/modules/conventions/service.ts` | **New** — extract, list, patch, compose; calls `SkillsService` / `AgentsService` |
| `server/src/modules/conventions/routes.ts` | **New** — GET list, POST extract (body `.nullish()`), PATCH `/:cid`, POST `/skills` |
| `server/src/modules/index.ts` | Register `conventions` plugin |
| `server/src/modules/repos/repository.ts` | Reuse `getById(workspaceId, id)` for 404/tenancy; do not duplicate |
| `server/src/modules/settings/feature-models.ts` | `resolveFeatureModel(container, workspaceId, 'conventions')` |
| `server/src/modules/skills/service.ts` | `CreateSkillInput.source?` default `'manual'`; compose passes `'extracted'` |
| `server/src/modules/agents/service.ts` | Reuse `linkSkill` (append). Do not call `setSkills` |
| `server/src/platform/container.ts` | `container.llm(provider)` + `repoIntel` + `git` already exist |
| `server/src/adapters/mocks.ts` | `MockLLMProvider.structuredBySchema`, `MockGitClient.files` |
| `server/src/modules/repo-intel/service.ts` | `getConventionSamples(repoId, 12)` — do not change junk-path filter |
| `server/src/modules/_shared/context.ts` | `getContext` on every route |
| `server/src/modules/_shared/schemas.ts` | `IdParams`; add repo+convention params in the module if needed |
| `server/src/platform/errors.ts` | `NotFoundError` / `ValidationError` (400 for non-accepted compose ids) |
| `server/test/conventions.it.test.ts` | **New** — extract / GET / PATCH / compose / 404 / empty samples |
| `server/test/skills.it.test.ts` | Template: `startPg` / `seed` / `buildApp` / `MockGitClient` |
| `server/test/helpers/pg.ts` | Testcontainers fixture |
| `client/src/lib/hooks/conventions.ts` | **New** — list, extract, patch, compose |
| `client/src/lib/hooks/index.ts` | Re-export |
| `client/src/lib/hooks/agents.ts` | Reuse `useAgents` for optional picker |
| `client/src/lib/repo-urls.ts` | `repoBlobUrl` — reuse |
| `client/src/lib/repo-urls.test.ts` | Pattern for GitHub vs GitLab line anchors |
| `client/src/lib/repo-context.tsx` | Active repo (`full_name`, `provider`, `default_branch`) |
| `client/src/vendor/ui/nav.ts` | **Exception** — add Conventions item (`ListChecks`, `/repos/:repoId/conventions`) |
| `client/src/components/app-shell/helpers.ts` | `activeKeyFor` already returns `"conventions"` — no change unless tests fail |
| `client/messages/en/conventions.json` | Extend (reject, deselect, create skill, compose modal, last-scan). Auto-loaded by `i18n/request.ts` |
| `client/src/app/repos/[repoId]/conventions/page.tsx` | **New** — thin page |
| `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/` | **New** — list, cards, selection, extract/re-scan |
| `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/CreateSkillFromConventionsModal/` | **New** — compose modal (pattern: `CreateSkillModal`) |
| `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/` | Field/chrome pattern to copy, not import across routes |
| `client/src/app/repos/[repoId]/pulls/page.tsx` | Shell + `useActiveRepo` + empty/error pattern to copy |
| `docs/specs/04-spec-conventions-extractor/04-proofs/` | **New** dir for screenshots |
| `reviewer-core/**` | Do **not** touch |

### Notes
- Tests live beside source (`helpers.test.ts`, `ConventionsView.test.tsx`) except server integration (`server/test/*.it.test.ts`).
- Server: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test`, `pnpm lint`.
- Client: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- Evidence gate and body assembly stay pure (no Fastify, no Drizzle).
- Do not exec/spawn/eval clone contents. Do not use Anthropic Citations. Do not add API Contract Reviewer.
- Do not edit applied migrations or lockfiles. Do not add Eval/Memory/Multi-Agent nav items.

## Tasks

### [x] 1.0 Extract, ground, persist, re-scan

New `conventions` module (`routes` → `service` → `repository`), registered in `server/src/modules/index.ts`. Extend the existing `conventions` table via a **new** Drizzle migration (status, category, line range, `created_at`; keep `accepted` in sync with `status`). `POST /repos/:id/conventions/extract` samples configs + top-12 files in code, calls the workspace `conventions` feature model (`completeStructured`), drops ungrounded / path-traversal candidates, persists survivors. Re-scan replaces **pending** only. `GET` returns candidates plus last-scan metadata. Live LLM is not a CI gate — tests use `MockLLMProvider` + fixture files. Do not execute clone code. Do not touch `reviewer-core`.

#### 1.0 Proof Artifact(s)
- CLI: `cd server && pnpm db:generate` appends a **new** migration that adds `conventions.status` (`pending \| accepted \| rejected`), keeps `accepted` boolean synced, adds `category`, `evidence_start_line`, `evidence_end_line`, `created_at`, and a `repo_id` index if missing. No file under `server/src/db/migrations/` that already exists is edited.
- Test: `cd server && pnpm exec vitest run src/modules/conventions/helpers.test.ts` — fixture file + in-range snippet is kept; missing file, out-of-bounds line, snippet not in range, and path `../etc/passwd` are dropped; `vi.spyOn` of `node:child_process` (`exec`, `execFile`, `spawn`, `fork`) stays unused.
- Test: same helpers file (or colocated `extract.test.ts`) — re-scan fixture: pending rows replaced; accepted/rejected kept; a new pending with the same `rule` + `evidence_path` as an existing row is not inserted.
- Test: `cd server && pnpm exec vitest run test/conventions.it.test.ts` — `POST /repos/:id/conventions/extract` with `MockLLMProvider` structured fixture persists only grounded rows; `GET /repos/:id/conventions` lists them with `status: pending` plus `extracted_at` and `sample_file_count`; a second extract does not duplicate an accepted row. Empty-sample extract returns 200 and may be an empty list (not 500). Unknown / other-workspace repo → 404.
- Test: `cd server && pnpm exec vitest run test/contracts.test.ts` — `ConventionCandidate` parses `status`, `category`, `evidence_start_line`, `evidence_end_line`; `accepted` is true iff status is `accepted`.
- CLI: `cd server && pnpm typecheck` passes. `GET /skills` is unchanged by extract.

#### 1.0 Tasks
- [x] 1.1 Extend shared contracts in `server/src/vendor/shared/contracts/knowledge.ts` and mirror to `client/src/vendor/shared`: `ConventionStatus` enum; `ConventionCandidate` gains `status`, `category` (nullable string), `evidence_start_line`, `evidence_end_line`; keep `accepted: boolean`. Add `ConventionList` `{ items, extracted_at: string | null, sample_file_count: number }`. Add `ConventionPatch` `{ status?, rule? }` and `ConventionCompose` `{ convention_ids, name, description, type, body, enabled?, agent_id? }`. Same schema+type name, snake_case fields.
- [x] 1.2 `cd server && pnpm exec vitest run test/contracts.test.ts` — `ConventionStatus.parse('pending'|'accepted'|'rejected')`; candidate with `status: 'accepted'` has `accepted: true`; `ConventionList.parse` requires `items`; compose body requires `convention_ids` min 1 and Skill-required name/description/body.
- [x] 1.3 Update `server/src/db/schema/knowledge.ts` (`status` text enum default `pending`, `category`, `evidenceStartLine`, `evidenceEndLine`, `createdAt`, index on `repoId`) and `server/src/db/schema/repos.ts` (`conventionsExtractedAt`, `conventionsSampleCount`). Run `cd server && pnpm db:generate`. Do not edit any existing file under `server/src/db/migrations/`.
- [x] 1.4 Pure `helpers.ts`: `isSafeRepoPath` (reject `..`, absolute, empty); `snippetInRange(fileText, start, end, snippet)` trim-tolerant, case-sensitive; `groundCandidate(fileText | null, candidate)` drops missing file / bad range / missing snippet. `helpers.test.ts` covers keep, missing file, OOB line, snippet mismatch, `../etc/passwd`. Spy `node:child_process` — unused.
- [x] 1.5 Pure re-scan helpers: `pendingDedupeKey(rule, path)`; `shouldInsertPending(existingRows, candidate)` false when any existing row (any status) shares rule+path. Tests: pending replaced conceptually (key match); accepted/rejected keys block insert.
- [x] 1.6 `constants.ts`: sample N = 12; closed config basename list (e.g. `tsconfig.json`, `eslint.config.js`, `.eslintrc.cjs`, `.prettierrc`, `.prettierrc.json`). Structured schema name for MockLLM lookup (e.g. `ConventionExtraction`). Do **not** add `ConventionFileSelection`.
- [x] 1.7 `repository.ts`: list by workspace+repo; insert pending (`accepted=false`); `deletePending(repoId)`; patch `status`/`rule` and set `accepted = status === 'accepted'`; no Drizzle of `skills`. Service `extract`: `ReposRepository.getById` → 404; try config basenames via `container.git.readFile`; `repoIntel.getConventionSamples(id, 12)`; `resolveFeatureModel(..., 'conventions')` then `container.llm(provider).completeStructured`; ground each row; `deletePending` then insert those `shouldInsertPending`; write repo extract metadata. Empty sample list still 200.
- [x] 1.8 `routes.ts` + register in `modules/index.ts`: `GET /repos/:id/conventions`; `POST /repos/:id/conventions/extract` with `schema.body` **`.nullish()`**; `PATCH /repos/:id/conventions/:cid`. Workspace via `getContext`.
- [x] 1.9 `test/conventions.it.test.ts` (copy `skills.it.test.ts` harness): seed repo; `overrides.git` with fixture file contents; `overrides.llm` structured list mixing one grounded and one bad path; `overrides.repoIntel.getConventionSamples` returns the fixture path. Assert POST extract 200, GET items are pending+grounded only, metadata present, second extract after PATCH accepted does not duplicate that rule+path, ghost repo 404, extract with no readable samples 200. `GET /skills` count unchanged. `pnpm typecheck`.

### [ ] 2.0 Conventions page — list, accept / reject / edit, evidence

Thin App Router page `/repos/:repoId/conventions` with colocated feature folder. Skills Lab sidebar gains **Conventions** (`client/src/vendor/ui/nav.ts` exception). Empty state = Run extraction; after a scan, Re-scan. Cards show rule, `path:start-end`, snippet, confidence, Accepted / Reject. PATCH persists `status` and `rule`. Evidence control uses existing `repoBlobUrl` (GitHub + GitLab). Only accepted cards can be selected for compose; Deselect all clears selection only; Create skill disabled at 0 selected. Hooks in `client/src/lib/hooks/`; i18n under `conventions.json`.

#### 2.0 Proof Artifact(s)
- Test: `cd client && pnpm test` — colocated list tests with mocked `GET /repos/:id/conventions`: empty CTA visible; cards render rule, `path:start-end`, snippet, confidence percent; Accept calls `PATCH` with `{ status: 'accepted' }`; Reject calls `{ status: 'rejected' }`; Create skill disabled when zero accepted are selected; Deselect all does **not** PATCH status; rejected cards are in the document but not selectable.
- Test: same suite (or colocated helpers test) — evidence `href` equals `repoBlobUrl` for GitHub `blob/...#L23-L31` and GitLab `-/blob/...#L23-31` (reuse `client/src/lib/repo-urls.test.ts` cases).
- Test: `cd client && pnpm test` — inline/edit of `rule` calls `PATCH` with `{ rule }`.
- URL: `http://localhost:3000/repos/<seeded-repo-id>/conventions` — sidebar Conventions is the active Skills Lab item; breadcrumb Skills Lab → Conventions; title “Conventions in {repo}”.
- Screenshot: `docs/specs/04-spec-conventions-extractor/04-proofs/04-conventions-list.png` — after extract, cards show title, evidence path+range, snippet, confidence, Accepted/Reject, Create skill (match [04-mockup-conventions-list.png](./04-mockup-conventions-list.png) closely enough).

#### 2.0 Tasks
- [ ] 2.1 Add Conventions to `NAV` in `client/src/vendor/ui/nav.ts` (explicit exception): `key: "conventions"`, icon `ListChecks`, `href: "/repos/:repoId/conventions"`. Do not add Eval / Memory / Multi-Agent / CI items. `activeKeyFor` already maps `/conventions`.
- [ ] 2.2 `client/src/lib/hooks/conventions.ts` + barrel: `useConventions(repoId)`, `useExtractConventions(repoId)` (POST extract), `usePatchConvention(repoId)` (PATCH). Mocked in component tests; no `fetch` in components.
- [ ] 2.3 Extend `client/messages/en/conventions.json`: reject, deselect all, N of M accepted, create skill, last-scan/sample subtitle, scanning, load/extract errors. Keep existing empty-state keys. Namespace loads automatically via `i18n/request.ts`.
- [ ] 2.4 Thin `page.tsx` + `ConventionsView`: AppShell, breadcrumb Skills Lab → Conventions, title “Conventions in {repo}”. `items.length === 0` → empty CTA Run extraction; after items exist → Re-scan (not a second empty CTA). Subtitle shows `sample_file_count` and last-scan when `extracted_at` is set. Tests: empty CTA; Re-scan visible when items exist.
- [ ] 2.5 Candidate cards: rule, `path:start-end`, snippet, confidence bar + percent, Accepted / Reject. Accept → PATCH `{ status: 'accepted' }`; Reject → `{ status: 'rejected' }`. Rejected remain visible, not selectable. Only accepted can be selected. Create skill disabled at 0 selected. Deselect all clears selection and does not PATCH. Tests cover each of those calls/non-calls.
- [ ] 2.6 Colocated `evidenceHref` helper wrapping `repoBlobUrl(provider, full_name, default_branch, path, start, end)`. Tests: GitHub `#L23-L31` and GitLab `#L23-31`. External-link control `target="_blank"` `rel="noreferrer"`.
- [ ] 2.7 Edit rule on the card (inline title or small control). Persist PATCH `{ rule }`. Test asserts the PATCH body.
- [ ] 2.8 Manual: `./scripts/dev.sh`, open `http://localhost:3000/repos/<seeded-repo-id>/conventions`, run extract (needs LLM key; mock-shaped live result is OK). Save `04-proofs/04-conventions-list.png`. Do not fail CI on live model wording.

### [ ] 3.0 Create skill from selected accepted conventions

Create skill opens **Create skill from conventions**. Banner = merged from N accepted in {repo}. Defaults: name `{repo-slug}-conventions`, type `convention`, enabled on, body from **selected accepted** rows only (rejected / pending / deselected omitted). Description is required (`Skill` `min(1)`). Token count uses existing client `approxTokens` (`ceil(chars/4)`). Optional agent picker (not on the mockup; Q5): none → Skills Lab only; an agent → `linkSkill` append. Confirm verifies ids server-side; `source = extracted`; Cancel persists nothing and does not change convention rows. One modal = one skill. Do not add a split-toggle. Do not replace the agent’s skill list.

#### 3.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run src/modules/conventions/helpers.test.ts` — body assembler includes only the given accepted rows; a rejected row in the input is omitted (assembler) **and** `POST /repos/:id/conventions/skills` with a non-accepted id returns **400**.
- Test: `cd server && pnpm exec vitest run test/conventions.it.test.ts` — compose of two accepted ids creates one skill with `source: 'extracted'`, `type: 'convention'`, body containing both rules and **not** a rejected rule; `GET /skills` includes it; Cancel (no compose call) leaves a pre-compose `GET /skills` snapshot unchanged; optional `agent_id` → `GET /agents/:id/skills` contains the new `skill_id` **and** every previously linked skill_id.
- Test: `cd client && pnpm test` — compose modal: banner shows N; Create stays disabled while name, description, or body is empty; Cancel does not POST; token label is present; agent picker can be left empty.
- URL: after save, `http://localhost:3000/skills` lists the new skill; with agent selected, `http://localhost:3000/agents/<id>?tab=skills` shows it enabled/linked.
- Screenshot: `docs/specs/04-spec-conventions-extractor/04-proofs/04-create-skill-modal.png` — modal fields match [04-mockup-create-skill.png](./04-mockup-create-skill.png) (name, description, type, enabled, body). Agent picker may appear below Enabled even though the mockup omits it.

#### 3.0 Tasks
- [ ] 3.1 `assembleSkillBody(name, repoLabel, rows)` in `helpers.ts`: H1 = name; one preamble line to flag violations and cite `file:line`; per row `## {slug(category\|\|rule)}` + rule + `Detected in \`path:start-end\``. Assembler **omits** non-accepted rows. Tests: two accepted in, rejected dropped; slug is heading-safe. Copy `approxTokens` as `Math.ceil(text.length / 4)` on the client colocated helper; test `approxTokens('abcd') === 1`.
- [ ] 3.2 `SkillsService.create`: optional `source` default `'manual'`. `POST /skills` behaviour unchanged (still `manual`). Compose is the only writer of `extracted`. Existing `skills.it.test.ts` create case stays green (`source: 'manual'`).
- [ ] 3.3 `POST /repos/:id/conventions/skills`: 400 if any id missing, other-repo, or not `accepted` (do not trust client body to skip this); create via `SkillsService` with `source: 'extracted'`; if `agent_id` set, `AgentsService.linkSkill` append (assert previous links remain). Convention rows unchanged. Cancel = no request.
- [ ] 3.4 Extend `conventions.it.test.ts`: two accepted + one rejected; compose two ids → one skill `extracted`/`convention`, body has both rules not the rejected; skills snapshot before a no-op (no compose) unchanged; agent with one existing link + compose `agent_id` → GET links length previous+1 including new id.
- [ ] 3.5 `CreateSkillFromConventionsModal` (copy Create Skill fields, do not import across routes). Banner “Merged from N accepted conventions in {repo}”. Defaults: `{repo-slug}-conventions`, description non-empty, type `convention`, enabled on, body from selected accepted only. Create disabled while name/description/body empty. No split-toggle. Token label from colocated `approxTokens`. Cancel does not POST. Tests for banner N, disabled submit, cancel, token label, absence of a split control.
- [ ] 3.6 Optional agent `<SelectInput>`: `useAgents()`, empty option = none. Tests: picker can stay empty; choosing an id includes `agent_id` in POST body.
- [ ] 3.7 Manual: save from the modal → `/skills` shows the skill; with an agent chosen → `/agents/<id>?tab=skills` lists it. Screenshot `04-proofs/04-create-skill-modal.png`. Live review injection is already spec 02 — do not add a second assembler; do not CI-gate on LLM findings.
