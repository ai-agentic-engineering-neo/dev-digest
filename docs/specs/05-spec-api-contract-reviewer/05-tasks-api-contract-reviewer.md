# 05-tasks-api-contract-reviewer.md

Source spec: [`05-spec-api-contract-reviewer.md`](./05-spec-api-contract-reviewer.md). Depends on spec 01 (skills library), spec 02 (agent binding), spec 03 (import + Test Quality). Spec 04 (conventions extractor) is **out of scope**.

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Tests beside source; `*.it.test.ts` = Postgres; Zod schema+type same name; snake_case REST; `feat:` commits; do-not-touch `vendor/`, applied migrations, lockfiles | none — this spec adds no new routes, tables, or NAV |
| `README.md` | yes | Studio = client `:3000` + server `:3001`; `./scripts/dev.sh` for local stack; L02 = skills + conventions extractor (conventions already shipped in 04) | none |
| `server/AGENTS.md` | yes | Module slice `routes.ts` → `service.ts` → `repository.ts`; shared contracts in `server/src/vendor/shared`; `pnpm db:generate` only for new migrations; hermetic vs `.it.test` | none — no new module |
| `client/AGENTS.md` | yes | Thin `page.tsx`; all API via `src/lib/hooks/*`; `pnpm test` mocks `fetch` | none — reuse existing AgentCard / Skills tab / Import modal |
| `reviewer-core/AGENTS.md` | yes | Engine stays ignorant of DB; `assemblePrompt` already accepts `skills?: string[]` and omits empty | none — spec forbids touching `reviewer-core` unless a bug is found |
| `TESTING.md` | yes | Behaviour at seams; one real Postgres integration per data-backed workflow; mock LLM/git; live LLM is not a CI gate | none |
| `.github/workflows/server-unit.yml`, `server-integration.yml`, `client.yml` | yes | CI: `pnpm typecheck` + hermetic vitest; integration job runs `*.it.test.ts` with Docker | none |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| `.pre-commit-config.yaml` | not found | — | — |
| `server/package.json`, `client/package.json` | yes | `typecheck`, `lint`, `test`; server `db:generate` / `db:migrate` / `db:seed`; unzip already present (`fflate`) | none — do not add another unzip lib |
| `server/eslint.config.js`, `client/eslint.config.mjs` | yes | ESLint per package (`pnpm lint`); both ignore `src/vendor/**` | none |
| `server/INSIGHTS.md` | yes | `skills.insert`+version snapshot must be in `this.db.transaction`; seed fixture URLs from `server/src/db/` are **three** hops (`../../../docs/...`), not four | seed of new skills must go through `SkillsRepository.insert`; #902 diff URL must not copy the four-hop mistake |
| `docs/agent-prompts/README.md` | yes | Every reviewer prompt: severity/verdict/findings-discipline blocks; no JSON shape in prose; keep `docs/agent-prompts/*.md` in sync with `seed-prompts.ts` | none |

**Assumptions (spec open questions, not blocking):**

1. Exact markdown wording of the four skill bodies and the agent prompt is an implementation detail as long as Unit 1’s instruction table and `docs/agent-prompts/README.md` conventions are honoured.
2. #902 field pair defaults to `userId` → `user_id`. Another public rename is allowed without a new spec if the PR title still says it is a breaking payload change.
3. Optional zip of `deprecation-policy` (dummy `scripts/`) is **not** required if markdown import is proven.
4. A dedicated e2e flow that waits for the new card is optional; do not add it if `e2e/specs/03-agents.flow.json` still passes.
5. No new Fastify plugin, migration, or `reviewer-core` change. Dual-gate injection stays spec 02 (`skillsPromptArg` / `assemblePrompt`).
6. `deprecation-policy` is the import-only skill. Seed inserts `breaking-change`, `response-schema`, `semver-discipline` only. Type of all four: `custom`.
7. API-contract skills are **not** attached to General / Security / Performance / Test Quality. General stays catalog-empty.
8. Quality levers / Claude `/insights` analog are design notes only — no extractor code in these tasks.
9. Live LLM wording on #902 is a demo proof, not a CI gate.
10. Create Agent modal is not a required demo path; seed is the stand.

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/db/seed-prompts.ts` | Add `API_CONTRACT_REVIEWER_PROMPT` (export it so hermetic tests can import it) |
| `docs/agent-prompts/api-contract-reviewer.md` | **New** — human-readable original; keep byte-sync with `seed-prompts.ts` |
| `docs/agent-prompts/README.md` | Link the new prompt file in the list of originals |
| `server/src/db/seed.ts` | Insert agent row (workspace + name); seed PR **#902** via `filesFromUnifiedDiff`; URL hops = `../../../docs/...` |
| `server/src/db/seed-skills.ts` | Export three API-contract bodies; upsert three skills; `setSkills` on API Contract only; do **not** insert `deprecation-policy` |
| `server/src/db/seed-skills.test.ts` | **New** hermetic — `## Good` / `## Bad` on each exported body; prompt convention smoke on `API_CONTRACT_REVIEWER_PROMPT` |
| `server/src/modules/skills/repository.ts` | Reuse `insert` (already transactional). Do not insert skills from `seed.ts` with raw `db.insert(t.skills)` |
| `server/src/modules/agents/repository.ts` | Reuse `setSkills` / `setSkillBindings`. Do not add a new method |
| `server/src/modules/agents/service.ts` | Import/attach demo uses existing `POST /agents/:id/skills` `{ skills: [{ skill_id, enabled }] }` |
| `server/src/modules/skills/routes.ts` | Reuse `POST /skills/import/preview` and `POST /skills/import`. Do not add routes |
| `server/test/skills-seed.it.test.ts` | Extend: API Contract matrix, import+attach `deprecation-policy`, PR #902 patch |
| `server/test/prompt-structured.test.ts` | Hermetic: #902 diff + exported API-contract bodies on/off |
| `server/src/modules/reviews/helpers.ts` | Reuse `skillsPromptArg`. Do not add a second assembler |
| `server/src/modules/reviews/helpers.test.ts` | Keep green; do not duplicate the #902 case here if `prompt-structured.test.ts` covers it |
| `server/src/modules/reviews/diff-loader.ts` | #902 must store `pr_files.patch` so the PR page works without a clone |
| `docs/skill-fixtures/deprecation-policy/SKILL.md` | **New** — import fixture (YAML name/description + good/bad body). Not seeded |
| `docs/skill-fixtures/breaking-response-rename.diff` | **New** — silent `userId` → `user_id` on a public handler |
| `docs/skill-fixtures/flaky-tests/SKILL.md` | Pattern to copy for YAML frontmatter; do not modify |
| `client/src/app/agents/_components/AgentCard/AgentCard.tsx` | Already shows name / model / skill count — no new card type |
| `client/src/app/skills/_components/SkillsListView/_components/ImportSkillModal/` | Reuse as-is for the demo import |
| `e2e/specs/03-agents.flow.json` | Must still find “Security Reviewer”; do not add a live-LLM flow |
| `reviewer-core/**` | Do **not** touch |
| `server/src/modules/conventions/**` | Do **not** touch |
| `docs/specs/05-spec-api-contract-reviewer/05-proofs/` | **New** dir for screenshots + `05-task-3-proofs.md` |

### Notes
- Tests live beside source (`seed-skills.test.ts`) except server integration (`server/test/*.it.test.ts`).
- Server: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test`, `pnpm lint`.
- Client: no new components expected; `pnpm test` should stay green without new files.
- Do not add a Fastify plugin, migration, `@fastify/multipart`, URL fetch, oasdiff, extractor changes, Evals/Stats/Context tabs, or `pr-self-review`.
- Do not wrap skill bodies in `<untrusted>`. Do not add a second `assemblePrompt`.
- Do not edit applied migrations, `src/vendor/`, or lockfiles by hand.
- Live LLM wording is a demo proof, not a CI gate.

## Tasks

### [x] 1.0 Seed API Contract Reviewer and three skills

Idempotent seed of **API Contract Reviewer** (same provider/model as other built-ins, `ci_fail_on` default `critical`, no scheduler) plus three `custom` skills: `breaking-change`, `response-schema`, `semver-discipline`. Each body is directive and contains a good/bad pair per the spec table. System prompt lives in `seed-prompts.ts` **and** `docs/agent-prompts/api-contract-reviewer.md` (linked from the prompts README) and follows prompt conventions (no JSON shape). `deprecation-policy` is **not** inserted. Links attach only to this agent, enabled, in that order. Second `pnpm db:seed` does not duplicate the agent or skill names. Do not touch `reviewer-core`, conventions, NAV, or applied migrations.

#### 1.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run test/skills-seed.it.test.ts` — after two `seed()` calls, `GET /agents` has exactly one **API Contract Reviewer**; that agent’s `ci_fail_on` is `critical` and `provider`/`model` match `DEFAULT_PROVIDER` / `DEFAULT_MODEL`; `GET /skills` contains `breaking-change`, `response-schema`, `semver-discipline` once each and does **not** contain `deprecation-policy`; `GET /agents/:id/skills` for that agent is those three names, all `enabled: true`, type `custom`, descriptions non-empty; General / Security / Performance / Test Quality link lists are unchanged from spec 03.
- Test: `cd server && pnpm exec vitest run src/db/seed-skills.test.ts` — exported API-contract body constants each contain `## Good` and `## Bad` (or equivalent) and the flag instruction for that row; exported `API_CONTRACT_REVIEWER_PROMPT` contains `CRITICAL`, `WARNING`, `SUGGESTION`, `request_changes`, and `No findings` (or `no findings`) and does **not** contain `json_schema` or a `{ verdict` JSON example.
- URL: `http://localhost:3000/agents` — existing `AgentCard` shows name, model chip, skill count **3**.
- Screenshot: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-agent-card.png`.
- CLI: `cd server && pnpm typecheck` passes. `ls server/src/db/migrations/` is unchanged (no new SQL file).

#### 1.0 Tasks
- [x] 1.1 Add `API_CONTRACT_REVIEWER_PROMPT` in `server/src/db/seed-prompts.ts` and the matching `docs/agent-prompts/api-contract-reviewer.md`. Link it from `docs/agent-prompts/README.md`. Role: review **this** diff for public HTTP contract breakage only (not tests, secrets, or N+1). Priority: silent public-field/route rename or delete; response-shape drift; missing major bump; silent delete vs deprecation. Honour `docs/agent-prompts/README.md`: severity rubric (`CRITICAL` = silent public break with no deprecation and no major path; `WARNING` = incomplete deprecation/shim; `SUGGESTION` = docs-only / additive optional), anti-inflation, verdict mapping including no-findings ⇒ approve, findings discipline, **no JSON shape / markdown layout**. Export the constant. Same `DEFAULT_PROVIDER` / `DEFAULT_MODEL` as other built-ins. Do not add a scheduler.
- [x] 1.2 In `server/src/db/seed.ts`, append one `seedAgents` row `API Contract Reviewer` (description: flags public-contract breaks — renamed/removed fields and routes, shape drift, missing major, silent deletion). Lookup by workspace + name already in the loop — do not add a second insert path. Leave `ciFailOn` unset so the table default `critical` applies. Update the file’s seed-summary comment that still says “General + Security + Performance + Test Quality”.
- [x] 1.3 In `server/src/db/seed-skills.ts`, export `BREAKING_CHANGE_BODY`, `RESPONSE_SCHEMA_BODY`, `SEMVER_DISCIPLINE_BODY`, and `API_CONTRACT_SKILL_BODIES` (same pattern as `TEST_QUALITY_SKILL_BODIES`). Each body: directive flag list + `## Good` + `## Bad` matching the spec Unit 1 table. Descriptions required, directive, UI-only. Type `custom`. Upsert via existing `upsertSkill` → `SkillsRepository.insert`. **Do not** insert `deprecation-policy`.
- [x] 1.4 In `seedSkills`, after Test Quality links, `setSkills` on **API Contract Reviewer** to the three skills in order, all `enabled: true`. Do not add those skill ids to General / Security / Performance / Test Quality. Existing `setSkills` replace-per-agent is OK (call it only for this agent id).
- [x] 1.5 Add `server/src/db/seed-skills.test.ts` (hermetic, no Postgres): each `API_CONTRACT_SKILL_BODIES` entry matches `/## Good/i` and `/## Bad/i`; `BREAKING_CHANGE_BODY` mentions a public-field rename; `RESPONSE_SCHEMA_BODY` mentions type/nullability or requiredness; `SEMVER_DISCIPLINE_BODY` mentions major; `API_CONTRACT_REVIEWER_PROMPT` matches the 1.0 prompt smoke (severities + `request_changes` + no-findings; no `json_schema` / `{ verdict`). `cd server && pnpm exec vitest run src/db/seed-skills.test.ts`.
- [x] 1.6 Extend `server/test/skills-seed.it.test.ts` (keep the existing two-`seed()` `beforeAll`): unique API Contract agent; unique three skill names; `deprecation-policy` absent; API Contract links equal `['breaking-change','response-schema','semver-discipline']` all enabled; other four agents’ link lists **deep-equal** the current spec 03 expectations (copy those `expect`s, do not weaken them). Assert `ci_fail_on === 'critical'`. `pnpm typecheck`. Manual: `./scripts/dev.sh`, screenshot `05-proofs/05-agent-card.png`. Do not add a client RTL test unless AgentCard stops showing skill count.

### [ ] 2.0 Import `deprecation-policy` and attach on the Skills tab

Commit `docs/skill-fixtures/deprecation-policy/SKILL.md` (YAML `name` / `description`, good/bad pair, no silent delete). Import through the **existing** spec 03 path (preview → confirm → `enabled: false`, `source: imported`). Enable in the library, then `POST /agents/:id/skills` with the **full ordered set** that keeps the three seeded `skill_id`s and appends the new one. After attach, four ordered names: `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`. Dual-gate still applies. Do not add a second parser, multipart, URL fetch, or Create Agent as the required path. Optional zip with dummy `scripts/` is not required.

#### 2.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run test/skills-seed.it.test.ts` — `POST /skills/import/preview` of the fixture does **not** insert a row (snapshot `GET /skills` length unchanged); `POST /skills/import` creates `enabled: false`, `source: imported`; `PUT` `{ enabled: true }` + `POST /agents/:id/skills` with `{ skills: [...existing, { skill_id, enabled: true }] }` → `GET /agents/:id/skills` is four ordered names ending with `deprecation-policy`; the first three `skill_id`s equal the pre-attach snapshot.
- URL: `http://localhost:3000/skills` — Add Skill → Import of the fixture; then `http://localhost:3000/agents/<id>?tab=skills` shows four rows, last one the imported skill.
- Screenshot: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-skills-tab.png`.

#### 2.0 Tasks
- [ ] 2.1 Commit `docs/skill-fixtures/deprecation-policy/SKILL.md` copying YAML shape from `docs/skill-fixtures/flaky-tests/SKILL.md`. `name: deprecation-policy`. Description: flag silent deletion of a public field/route; require a deprecation marker and sunset. Body: keep old name working; **Bad:** delete `userId` in the same PR; **Good:** keep `userId`, add `user_id`, document deprecation. Do not seed this name. Do not commit a zip unless you already have one; markdown import is enough.
- [ ] 2.2 Copy the `flaky-tests` import+enable+attach case in `skills-seed.it.test.ts` onto **API Contract Reviewer** and `deprecation-policy/SKILL.md`. Snapshot `GET /skills.length` before preview; preview 200 and length unchanged; confirm 201, `enabled: false`, `source: 'imported'`; enable; POST full `skills` array (existing three + new id, all enabled). GET names `['breaking-change','response-schema','semver-discipline','deprecation-policy']`. First three `skill_id`s match the snapshot taken before POST. Do not call `{ skill_ids }` replace-only. Do not add import routes.
- [ ] 2.3 Manual: `./scripts/dev.sh` → `/skills` Import the fixture → enable → API Contract `?tab=skills` append so four rows show. Screenshot `05-proofs/05-skills-tab.png`. Do not open Create Agent. Do not add Evals/Stats/Context tabs. Dual-gate is already proven in spec 02 — do not add a second assembler test here.

### [ ] 3.0 Fixture PR #902 and without / with skills experiment

Commit `docs/skill-fixtures/breaking-response-rename.diff`: public handler under `src/api/public/` that renames a JSON response field (`userId` → `user_id` unless another public pair is chosen) **without** keeping the old key, **without** `deprecated`, **without** a `/v2/` path. Seed PR **#902** on `acme/payments-api` (lookup by repo + number, same as #901) with non-null `pr_files.patch`. Title/body state the breaking rename. Hermetic `assemblePrompt` with exported API-contract bodies includes them under `## Skills / rules`; `skillsPromptArg([])` → `assembly.skills === null`. No live LLM in CI. No second assembler. No `reviewer-core` change unless a bug is found. Manual demo: API Contract only, skills off then on. Do not add an e2e live-LLM job; do not add a new e2e flow unless `03-agents` breaks.

#### 3.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run test/prompt-structured.test.ts` — committed #902 diff + `API_CONTRACT_SKILL_BODIES` → `assembly.skills` contains each body and user content contains `## Skills / rules`; `skillsPromptArg([])` → `assembly.skills === null`. No LLM provider is invoked. Import bodies from `seed-skills.ts`, not string literals.
- Test: `cd server && pnpm exec vitest run test/skills-seed.it.test.ts` — after two seeds, exactly one PR **#902** on `acme/payments-api`; title/body mention rename or breaking; `pr_files.patch` contains `user_id` and `userId` and does **not** contain `deprecated`.
- CLI: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` stays green for the new hermetic case.
- URL: after `./scripts/dev.sh`, `http://localhost:3000/repos/<seeded-repo-id>/pulls/902`.
- Screenshot: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-fixture-pr-902.png` — title/body state the breaking payload rename.
- Screenshot: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-trace-skills-off.png` — API Contract run on #902 with skill links unchecked; Prompt assembly has **no** skills block.
- Screenshot: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-trace-skills-on.png` — same PR with links enabled; skills block present and token count non-zero. Live findings **may** cite the rename; wording must not fail CI.
- Checklist: `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-task-3-proofs.md`.

#### 3.0 Tasks
- [ ] 3.1 Commit `docs/skill-fixtures/breaking-response-rename.diff` (unified diff, same header style as `happy-path-only.diff`). One file under `src/api/public/` (e.g. `src/api/public/users.ts`). Show `-` lines with `userId` in a JSON/object payload and `+` lines with `user_id` only. No remaining `userId` alias, no `deprecated`, no `/v2/`. Keep the diff small enough that `filesFromUnifiedDiff` in `seed.ts` still parses it.
- [ ] 3.2 In `server/src/db/seed.ts`, after the #901 block, seed PR **#902** on `acme/payments-api` (lookup `repoId` + `number === 902`). `readFileSync(new URL('../../../docs/skill-fixtures/breaking-response-rename.diff', import.meta.url))` — **three** hops, not four. Title/body: silent rename of a public payload field, no deprecation, no major bump. Persist `pr_files` with `patch` set; add a `pr_commits` row. Copy the #901 control-flow (`if (!pr902)`). Do not extract `filesFromUnifiedDiff` unless a test needs it.
- [ ] 3.3 Extend `server/test/prompt-structured.test.ts`: read the #902 diff via `new URL('../../docs/skill-fixtures/breaking-response-rename.diff', import.meta.url)` (tests are two hops). `assemblePrompt` with `...skillsPromptArg(API_CONTRACT_SKILL_BODIES)` and a task line for PR #902 → each body in `assembly.skills`, `## Skills / rules` present, diff text contains `user_id`. Second call with `skillsPromptArg([])` → `assembly.skills === null`. Import `assemblePrompt` from `server/src/platform/prompt.js` (existing). Do not import `reviewer-core` to add a new assembler. Do not call an LLM.
- [ ] 3.4 Extend `skills-seed.it.test.ts` with a #902 case parallel to #901: one row after two seeds; title/body match /rename|breaking/i; some `pr_files.patch` includes `userId` and `user_id` and `!includes('deprecated')`. `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` green.
- [ ] 3.5 Add `docs/specs/05-spec-api-contract-reviewer/05-proofs/05-task-3-proofs.md` with a manual checklist: (1) API Contract on #902 with all skill links unchecked → trace Prompt assembly has no skills block; (2) enable the three (or four, if 2.0 was imported) links → run again → skills block + non-zero tokens; live findings may cite the rename / missing major / missing deprecation but **must not** fail CI; (3) do not add `e2e` live-LLM; confirm `03-agents` still sees “Security Reviewer”. Capture `05-fixture-pr-902.png`, `05-trace-skills-off.png`, `05-trace-skills-on.png`. Missing provider key → record that in the checklist like spec 03, do not fail the task on wording.
