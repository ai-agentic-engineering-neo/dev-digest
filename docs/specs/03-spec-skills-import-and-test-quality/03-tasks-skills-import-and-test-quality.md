# 03-tasks-skills-import-and-test-quality.md

Source spec: [`03-spec-skills-import-and-test-quality.md`](./03-spec-skills-import-and-test-quality.md) (part 3 of 3). Depends on spec 01 (skills library) and spec 02 (agent binding + dual-gate prompt assembly).

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocated `_components/<Name>/`; tests beside source; `*.it.test.ts` = Postgres; Zod schema+type same name; snake_case REST; `feat:` commits; do-not-touch `vendor/`, applied migrations, lockfiles | none |
| `README.md` | yes | Studio = client `:3000` + server `:3001`; `./scripts/dev.sh` for local stack | none |
| `server/AGENTS.md` | yes | Module slice `routes.ts` → `service.ts` → `repository.ts`; shared contracts live in `server/src/vendor/shared`; `pnpm db:generate` for new migrations; hermetic vs `.it.test` | none |
| `client/AGENTS.md` | yes | Thin `page.tsx`; all API via `src/lib/hooks/*`; `pnpm test` mocks `fetch` | none |
| `reviewer-core/AGENTS.md` | yes | Engine stays ignorant of DB; `assemblePrompt` already accepts `skills?: string[]` and omits empty; do not change unless a bug is found | none |
| `TESTING.md` | yes | Behaviour at seams; one real Postgres integration per data-backed workflow; no coverage chasing; live LLM is not a CI gate | none |
| `.github/workflows/server-unit.yml`, `server-integration.yml`, `client.yml` | yes | CI: `pnpm typecheck` + hermetic vitest per package; integration job runs `*.it.test.ts` with Docker | none |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| `.pre-commit-config.yaml` | not found | — | — |
| `server/package.json`, `client/package.json` | yes | `typecheck`, `lint`, `test`; server `db:generate` / `db:migrate` / `db:seed`; server lockfile has **no** zip library | none |
| `server/eslint.config.js`, `client/eslint.config.mjs` | yes | ESLint per package (`pnpm lint`) | none |
| `server/INSIGHTS.md` | yes | `skills.insert` must wrap row+`skill_versions` snapshot in `this.db.transaction` | none |

**Assumptions (spec open questions, not blocking):**

1. Ship **four** Test Quality skills by default. `flaky-tests` is the one **not** inserted by `seed.ts`; it ships as `docs/skill-fixtures/flaky-tests/` and is created through the Unit 1 import path.
2. Exact markdown wording of seeded bodies is an implementation detail as long as Unit 2’s instruction table is honoured (uncovered branches, corners, excessive mocking, flakes).
3. General Reviewer stays unattached (no `agent_skills` rows) so one agent remains catalog-empty.
4. Import preview default `type` is `custom`. Confirm is blocked until `description` is non-empty (existing `Skill` contract `min(1)`). Name comes from YAML `name` or the first markdown heading.
5. Archive size cap: reject zip/`.skill` larger than **2 MiB** or a `SKILL.md` larger than **1 MiB**. No URL fetch.
6. Zip reading: `server/package.json` has no unzip library. Add one small unzip-only dependency via `pnpm install` only if Node built-ins cannot read zip entries as strings; never `exec`/`spawn`/`eval`. Never hand-edit the lockfile.
7. Do not add a second prompt assembler. Spec 02 dual-gate (`enabledSkillBodies` / `skillsPromptArg`) is the injection path. Live LLM findings are demo proofs, not CI.
8. `SkillSource` gains `imported` (file import). Do not overload `imported_url`. URL / community import stay out of scope — do not wire `page.menu.fromUrl` / Community.
9. File bytes travel as JSON `{ filename, content_base64 }` (existing `api.ts` is JSON-only; no `@fastify/multipart` in the lockfile). Zip-slip / oversize map to HTTP **400** (spec), not `ValidationError` 422.
10. Fixture control PR is **#901** on the seeded repo `acme/payments-api` (same lookup-by-number pattern as #482).

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/vendor/shared/contracts/knowledge.ts` | SoT: extend `SkillSource` with `imported`; add `SkillImportPreview` |
| `client/src/vendor/shared/contracts/knowledge.ts` | Required mirror of the shared contract (not a second design) |
| `server/src/db/schema/skills.ts` | Drizzle `source` enum union includes `imported` |
| `server/src/db/migrations/` | `pnpm db:generate` only if kit emits SQL — never edit applied files. `source` is already unconstrained `text` in `0000_init.sql` |
| `server/src/modules/skills/constants.ts` | Size caps (2 MiB archive / 1 MiB `SKILL.md`) and allowed extensions |
| `server/src/modules/skills/import.ts` | **New** — pure markdown + zip → preview DTO; zip-slip; no `child_process` / `fs.write*` |
| `server/src/modules/skills/import.test.ts` | **New** — hermetic parser proofs (no Postgres) |
| `server/src/modules/skills/helpers.ts` | Keep DTO map here; do not fold zip I/O into this file |
| `server/src/modules/skills/helpers.test.ts` | Existing bump-rule tests must stay green |
| `server/src/modules/skills/service.ts` | `previewImport` (no persist) + `confirmImport` (`enabled: false`, `source: 'imported'`) |
| `server/src/modules/skills/repository.ts` | `InsertSkill.source` union; wrap `insert`+snapshot in `this.db.transaction` |
| `server/src/modules/skills/routes.ts` | `POST /skills/import/preview` + `POST /skills/import`; existing `POST /skills` stays `manual` |
| `server/src/platform/errors.ts` | `AppError` status 400 for zip-slip / oversize / bad type |
| `server/test/contracts.test.ts` | `SkillSource.parse('imported')`; `'imported_url'` still distinct |
| `server/test/skills.it.test.ts` | Preview does not insert; confirm creates disabled imported row; cancel path = preview only |
| `server/test/helpers/pg.ts` | Testcontainers fixture reused by new seed it-test |
| `docs/skill-fixtures/flaky-tests/SKILL.md` | **New** — import fixture (YAML name/description + body). Not seeded |
| `docs/skill-fixtures/flaky-tests.skill.zip` | **New** — same core plus dummy `scripts/pwn.sh` (non-executable junk) |
| `docs/skill-fixtures/happy-path-only.diff` | **New** — committed control-experiment diff (test file, happy path only) |
| `server/package.json` / `server/pnpm-lock.yaml` | Unzip dep only via `pnpm install` if needed; never hand-edit the lockfile |
| `client/src/lib/api.ts` | Reuse JSON `api.post`; do not add a second multipart client |
| `client/src/lib/hooks/skills.ts` | `usePreviewSkillImport` / `useConfirmSkillImport`; invalidate `["skills"]` on confirm only |
| `client/src/lib/hooks/agents.ts` | Reuse `useSetAgentSkills` for the it-test/demo attach path — do not duplicate |
| `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx` | Add Skill menu: Create + Import from file; no URL / Community |
| `client/src/app/skills/_components/SkillsListView/SkillsListView.test.tsx` | Flip the spec-01 assertion: Import from file **is** present; URL/Community still absent |
| `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/` | Pattern to copy (Modal + FormField); do not overload Create with import |
| `client/src/app/skills/_components/SkillsListView/_components/ImportSkillModal/` | **New** — file pick, preview, trust warning, confirm/cancel |
| `client/messages/en/skills.json` | Trust-warning copy + `listItem.source.imported`; do not wire `drawer.tabs.url` / community |
| `server/src/db/seed.ts` | Call catalog/agent/PR #901 seed; keep lookup-by-workspace+name / repo+number |
| `server/src/db/seed-skills.ts` | **New** — mockup + Test Quality skill rows and `agent_skills` links (not `flaky-tests`) |
| `server/src/db/seed-prompts.ts` | `TEST_QUALITY_REVIEWER_PROMPT` |
| `docs/agent-prompts/test-quality-reviewer.md` | Human-readable original; keep in sync with `seed-prompts.ts` |
| `docs/agent-prompts/README.md` | Link the new prompt file |
| `server/test/skills-seed.it.test.ts` | **New** — idempotent catalog, link matrix, import+attach `flaky-tests` |
| `server/src/modules/reviews/helpers.ts` | Reuse `skillsPromptArg` — do not add a second assembler |
| `server/src/modules/reviews/helpers.test.ts` | Empty vs non-empty spread (already exists; extend if the fixture helper lands here) |
| `server/src/modules/reviews/diff-loader.ts` | Fixture PR must store `pr_files.patch` so demo works without a clone |
| `server/test/prompt-structured.test.ts` | Hermetic: fixture diff + Test Quality bodies → `assembly.skills`; omit → `null` |
| `reviewer-core/src/prompt.ts` | Read-only unless a bug: joins `skills` under `## Skills / rules` |
| `client/src/app/agents/_components/AgentCard/AgentCard.tsx` | Already shows name / model / skill count — no new card type |
| `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/` | Screenshots + `03-task-4-proofs.md` demo checklist |

### Notes
- Tests live beside source (`import.test.ts`, `ImportSkillModal.test.tsx`) except server integration (`server/test/*.it.test.ts`).
- Server: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test`, `pnpm lint`.
- Client: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- Parser stays pure (no Fastify/Drizzle). Persist only in `SkillsService.confirmImport`.
- Do not add `@fastify/multipart`, URL fetch, community catalog, Evals/Stats/Context tabs, `pr-self-review`, or API Contract Reviewer.
- Do not wrap skill bodies in `<untrusted>`. Do not add a second `assemblePrompt`.
- Do not edit applied migrations, `client/src/vendor/ui`, or lockfiles by hand.
- Live LLM wording is a demo proof, not a CI gate.

## Tasks

### [x] 1.0 Import parser — SKILL.md core only, never execute

Pure in-memory extract of name / description / body from a markdown file or a zip/`.skill` archive. Treat the bytes as untrusted. Locate `SKILL.md` at zip root **or** `skill-name/SKILL.md`. Ignore `scripts/`, `references/`, `assets/`, binaries, and every other entry. Reject zip-slip (`..`, absolute paths, symlinks). Enforce the size cap. Never call `exec` / `spawn` / `eval`. No Postgres and no persist in this task.

#### 1.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run src/modules/skills/import.test.ts` — fixture `SKILL.md` with YAML `name` / `description` frontmatter → preview DTO `{ name, description, body }` where `body` is the remainder (no frontmatter); missing frontmatter → name from first heading, `description` empty.
- Test: same file — zip containing `SKILL.md` plus `scripts/pwn.sh` → preview equals the markdown core; a `vi.spyOn` of `node:child_process` (`exec`, `execFile`, `spawn`, `fork`) and of `fs.writeFile` / `writeFileSync` stays unused; nested `skill-name/SKILL.md` (no root file) also parses.
- Test: same file — zip entry path `../etc/passwd` (and a symlink entry if the library exposes it) → parse throws an error with HTTP-400 semantics (no file written); archive over 2 MiB or `SKILL.md` over 1 MiB → same class of error; filename not ending in `.md` / `.zip` / `.skill` → same class of error.
- CLI: `cd server && pnpm typecheck` passes after the parser (and any `pnpm install` unzip dependency) lands. No applied migration is edited. `GET /skills` is not called in these tests.

#### 1.0 Tasks
- [x] 1.1 In `server/src/modules/skills/constants.ts` add `MAX_ARCHIVE_BYTES = 2 * 1024 * 1024`, `MAX_SKILL_MD_BYTES = 1024 * 1024`, and `IMPORT_EXTENSIONS = ['.md', '.zip', '.skill']`. Check `server/package.json` for an unzip library; if none, add a small unzip-only package with `cd server && pnpm install <pkg>` (never hand-edit `pnpm-lock.yaml`). Do not use `child_process`.
- [x] 1.2 Add `server/src/modules/skills/import.ts` with `parseMarkdownSkill(text: string): { name: string; description: string; body: string }`. Optional YAML frontmatter keys `name` / `description` only; remainder is `body`. Missing frontmatter: first ATX heading (`# …`) becomes `name`, `description` is `''`. Do not eval YAML beyond those two string keys (no `!!js` / arbitrary tags). Keep this file free of Fastify and Drizzle.
- [x] 1.3 In the same module, `readSkillMdFromZip(bytes: Uint8Array): string`: find `SKILL.md` at zip root **or** exactly one `*/SKILL.md` (one path segment). Reject `..`, absolute paths, backslashes used as traversal, and symlink entries. Do not decode or return any other zip entry. Never write to disk. Prefer the nested file only when root `SKILL.md` is absent; if both exist, use root.
- [x] 1.4 Add `parseImportedSkill(filename: string, bytes: Uint8Array)`: reject disallowed extensions and oversize archive/body using the 1.1 constants; `.md` → 1.2; `.zip` / `.skill` → 1.3 then 1.2. Throw a small `SkillImportError` (`statusCode: 400`) so routes can map it without using `ValidationError` (422).
- [x] 1.5 Write `import.test.ts` covering every 1.0 Proof Artifact case. Commit `docs/skill-fixtures/flaky-tests/SKILL.md` (frontmatter + body that instructs flagging time/order/unseeded randomness). Build zip-slip / `scripts/pwn.sh` zips **in the test** (do not commit a traversal archive). Spy `child_process` and `fs.writeFile`/`writeFileSync` as specified. `cd server && pnpm exec vitest run src/modules/skills/import.test.ts` and `pnpm typecheck` green.

### [x] 2.0 Confirm-only import API and Skills Lab UI

Authors pick **Add Skill → Import**, upload `.md` or zip/`.skill`, see name / description / rendered body **and** a trust warning (imported text becomes agent **instructions** once enabled and attached — not inert data), then Confirm. Confirm writes `enabled = false` and `source = imported`. Cancel / close persists nothing. Reuse Skills Lab chrome; do not add Evals / Stats / Context tabs or URL / community import.

#### 2.0 Proof Artifact(s)
- CLI: `cd server && pnpm db:generate` after the schema/enum edit. If kit emits a new SQL file, it must only add `imported` (never edit applied migrations). If it emits nothing because `skills.source` is already unconstrained `text` (`0000_init.sql`), that is acceptable — record the generate output in the proof note. Zod + drizzle unions still gain `imported`.
- Test: `cd server && pnpm exec vitest run test/contracts.test.ts` — `SkillSource.parse('imported')` succeeds; `Skill.parse` with `source: 'imported'` succeeds; `'imported_url'` remains a distinct value.
- Test: `cd server && pnpm exec vitest run test/skills.it.test.ts` — `POST /skills/import/preview` of the committed fixture does not insert a row; `POST /skills/import` creates one skill with `enabled: false`, `source: 'imported'`, body equal to the `SKILL.md` core; a second `GET /skills` after preview-without-confirm is unchanged vs the list snapshot taken before preview; zip-slip preview → 400; `source` of a normal `POST /skills` create stays `manual`.
- Test: `cd client && pnpm test` — `SkillsListView.test.tsx`: Add Skill menu contains Create **and** Import from file, and does **not** contain Import from URL / Community. Colocated import-modal tests: warning copy is in the document before Confirm; Confirm stays disabled while description is empty; Confirm calls the persist hook; Cancel does not.
- URL: `http://localhost:3000/skills` — Add Skill → Import is reachable beside Create.
- Screenshot: `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/03-import-preview-warning.png` — import of `docs/skill-fixtures/flaky-tests/` (markdown or zip), trust warning visible, skill **disabled** on the list after Confirm.

#### 2.0 Tasks
- [x] 2.1 In `server/src/vendor/shared/contracts/knowledge.ts` add `'imported'` to `SkillSource` (keep `imported_url`). Add `SkillImportPreview = z.object({ name: z.string(), description: z.string(), body: z.string().min(1) })` and matching `type`. Mirror both files in `client/src/vendor/shared/contracts/knowledge.ts`. Extend drizzle `skills.source` enum and `InsertSkill.source` with `'imported'`. Run `cd server && pnpm db:generate` (new SQL only, or document a no-op).
- [x] 2.2 In `SkillsService`: `previewImport(filename, bytes)` calls `parseImportedSkill` and returns `SkillImportPreview` (no repo calls). `confirmImport(workspaceId, { name, description, type, body })` requires `description.trim().length >= 1` and `body` min 1, then `repo.insert({ source: 'imported', enabled: false, type: type ?? 'custom', ... })`. Existing `create` stays `source: 'manual'`. Wrap `SkillsRepository.insert` (row + `skill_versions` v1) in `this.db.transaction` (`server/INSIGHTS.md`).
- [x] 2.3 In `routes.ts` add `POST /skills/import/preview` and `POST /skills/import` with Zod bodies `{ filename: z.string().min(1), content_base64: z.string().min(1) }` and `{ name, description, type, body }` respectively. Decode base64 in the route, catch `SkillImportError` → `AppError` 400. Do not add `@fastify/multipart`. Do not fetch URLs. Register nothing new in `modules/index.ts` (same skills plugin).
- [x] 2.4 Extend `server/test/contracts.test.ts` and `server/test/skills.it.test.ts` with every 2.0 API case (preview snapshot of `GET /skills`, confirm disabled+imported, zip-slip 400, manual create still `manual`). Keep existing CRUD cases green.
- [x] 2.5 Add `usePreviewSkillImport` / `useConfirmSkillImport` in `client/src/lib/hooks/skills.ts` (`api.post` JSON). Invalidate `["skills"]` **only** on confirm. Colocate `ImportSkillModal/` (`tsx`, `styles.ts`, `constants.ts`, `index.ts`) next to `CreateSkillModal`. File input → FileReader as base64 → preview. Render name, description (editable if empty), body via existing `@devdigest/ui` `Markdown`, and the trust warning **before** Confirm. Confirm disabled until description is non-empty. Cancel/`onClose` must not call confirm. No `fetch(` in the modal.
- [x] 2.6 In `SkillsListView.tsx` append `{ label: t("page.menu.fromFile"), icon: "Upload", onClick: open import modal }` beside Create. Do not add `fromUrl` or Community items. Add i18n: `listItem.source.imported`, plus a warning string that says imported text becomes **instructions** in an agent prompt once enabled and attached (not inert data). Update `SkillsListView.test.tsx` (Import from file present; URL/Community absent) and add `ImportSkillModal.test.tsx` for the 2.0 UI cases. `cd client && pnpm test` green.

### [x] 3.0 Seed mockup catalog and Test Quality Reviewer

Idempotent seed of the mockup skill catalog and attachments (Security / Performance as specified; General stays empty). Seed **Test Quality Reviewer** with the same default provider/model as other built-ins, a test-weakness system prompt (not product-correctness-in-general), and three seeded test-quality skills. The fourth (`flaky-tests`) is **not** in `seed.ts` — demo/e2e imports it via 2.0, enables it, and attaches it. `pr-quality-rubric` is one skill row linked to two agents.

#### 3.0 Proof Artifact(s)
- CLI: `cd server && pnpm db:seed` twice against the same database — `GET /skills` names are unique (no duplicated catalog or Test Quality skills); `GET /agents` has exactly one **Test Quality Reviewer**.
- Test: `cd server && pnpm exec vitest run test/skills-seed.it.test.ts` after seed:
  - Catalog names present: `pr-quality-rubric`, `no-then-chains`, `secret-leakage-gate`, `lethal-trifecta`, `phantom-api-gate`, `test-coverage-nudge`.
  - `flaky-tests` is **absent** until import.
  - Security `GET /agents/:id/skills`: `pr-quality-rubric`, `no-then-chains`, `secret-leakage-gate`, `lethal-trifecta` linked and enabled; `phantom-api-gate` and `test-coverage-nudge` linked with `enabled: false`.
  - Performance: only `pr-quality-rubric` linked (same `skill_id` as Security’s rubric row); no `no-then-chains` row.
  - General: `[]` links.
  - Test Quality: three links (`uncovered-branches`, `corner-cases`, `excessive-mocking`) ordered; types `custom` or `rubric` as chosen; descriptions non-empty and directive.
- Test: after the integration case that plays the import+enable+attach path, `GET /agents/:id/skills` for Test Quality returns **four** ordered links including `flaky-tests`.
- URL: `http://localhost:3000/agents` — Test Quality Reviewer card shows name, model chip, and skill count like other built-in agents (existing `AgentCard`).
- Screenshot: `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/03-test-quality-skills-tab.png` — Test Quality `?tab=skills` with 3 or 4 attached skills after seed + import.

#### 3.0 Tasks
- [x] 3.1 Add `TEST_QUALITY_REVIEWER_PROMPT` in `server/src/db/seed-prompts.ts` and the matching `docs/agent-prompts/test-quality-reviewer.md` (link it from `docs/agent-prompts/README.md`). Prompt must tell the model to review **test** changes for weakness (uncovered branches, missing corners, excessive mocks, flakes), not product correctness in general. Use the same `DEFAULT_PROVIDER` / `DEFAULT_MODEL` as the other built-ins. Leave `ci_fail_on` at the table default (`critical`). Do not add a scheduler.
- [x] 3.2 Add `server/src/db/seed-skills.ts` and call it from `seed.ts`. Upsert skills by `(workspaceId, name)` (same pattern as agents). Seed the six mockup rows with the spec types, plus Test Quality’s three: `uncovered-branches`, `corner-cases`, `excessive-mocking` (`custom`, or `rubric` if the body is a scoring rubric). Descriptions required, directive, UI-only. Also write `skill_versions` v1 (use `SkillsRepository.insert` or insert both tables). **Do not** insert `flaky-tests`.
- [x] 3.3 Seed agent `Test Quality Reviewer` (lookup by workspace + name). Then seed `agent_skills`: Security enabled `pr-quality-rubric`, `no-then-chains`, `secret-leakage-gate`, `lethal-trifecta` and disabled links for `phantom-api-gate`, `test-coverage-nudge`; Performance only `pr-quality-rubric` (reuse that row’s `id`); Test Quality the three skills in that order, `enabled: true`; General — no rows. Second seed must not duplicate links (delete+insert for that agent, or skip when links already exist).
- [x] 3.4 Commit `docs/skill-fixtures/flaky-tests.skill.zip`: `SKILL.md` equal to 1.5’s markdown plus a dummy `scripts/pwn.sh` that is **not** a working exploit (plain `echo ignored`). No live binaries. This file is the zip import demo; parser tests may also read it.
- [x] 3.5 Add `server/test/skills-seed.it.test.ts` (`startPg` / `seed` / `buildApp` like `skills.it.test.ts`) covering the 3.0 matrix, including a second `seed()` call for uniqueness. One extra case: `POST /skills/import` of the flaky fixture → `PUT` `{ enabled: true }` → `POST /agents/:id/skills` appending `{ skill_id, enabled: true }` onto Test Quality’s existing links → GET shows four ordered names ending with `flaky-tests`.

### [x] 4.0 Fixture PR control experiment (hermetic + demo)

Seed **one** fixture pull request whose test file covers only the happy path (title/body make that obvious). Hermetic tests prove prompt inclusion/exclusion for that diff with Test Quality skills on vs off — **no live LLM**. A manual demo (not CI) runs Test Quality off then on, and a manual Security (and/or General) run on **this feature’s own PR** shows both a front-end skill (`no-then-chains`) and a back-end skill (`secret-leakage-gate` or `lethal-trifecta`) in the trace. Do not add `pr-self-review` or API Contract Reviewer. Do not add a second assembler.

#### 4.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run test/prompt-structured.test.ts` **and** `src/modules/reviews/helpers.test.ts` — given `docs/skill-fixtures/happy-path-only.diff` plus Test Quality’s enabled skill bodies (inline strings matching the seeded bodies), `assemblePrompt` yields `assembly.skills` containing those bodies and user content containing `## Skills / rules`; `skillsPromptArg([])` is `{}` and omitted skills → `assembly.skills === null`. No LLM provider is invoked.
- CLI: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` stays green for the new hermetic cases. Seed creates PR **#901** idempotently (lookup by `acme/payments-api` + number, same pattern as #482) with a non-null `pr_files.patch`.
- URL: after `./scripts/dev.sh`, open repo `acme/payments-api` pull **#901** (`http://localhost:3000` → that PR). Title/body state that tests cover the happy path only.
- Screenshot: `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/03-fixture-trace-skills-on.png` — Test Quality run with skills enabled; Prompt assembly shows the skills block and a non-zero token count (spec 02 UI). Companion note for skills-off: skills block absent / no test-quality findings. **Do not fail CI on model wording.**
- Screenshot: `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/03-security-self-review-skills.png` — operator-clicked Security (no auto-run) on this feature’s PR; trace skills block includes `no-then-chains` (front-end) and `secret-leakage-gate` or `lethal-trifecta` (back-end). Checklist: `03-proofs/03-task-4-proofs.md`.

#### 4.0 Tasks
- [x] 4.1 Commit `docs/skill-fixtures/happy-path-only.diff`: a small production helper with `if (err)` / empty-input branches and a test file that only asserts the success path (no error/empty assertions). In `seed.ts`, insert PR **#901** on `acme/payments-api` (title/body say happy-path-only tests). Persist at least one `pr_files` row **with `patch` set** to that diff so `diff-loader.ts` can reconstruct without a git clone. Lookup by repo + number so a second seed does not duplicate.
- [x] 4.2 Extend `server/test/prompt-structured.test.ts`: read the committed diff; pass `skills` = the three Test Quality bodies (and optionally `flaky-tests`); assert `assembly.skills` contains them and `## Skills / rules` is present; a second call without `skills` / with `[]` keeps `assembly.skills` null. Reuse `assemblePrompt` from `server/src/platform/prompt.js` (existing import). Do not call a live LLM. Do not add a new assembler in `reviewer-core`.
- [x] 4.3 Add `docs/specs/03-spec-skills-import-and-test-quality/03-proofs/03-task-4-proofs.md` with a manual checklist: (1) Test Quality on #901 with skills disabled → no skills block / no test-quality findings; (2) enable+run → skills block + token figure; live findings may cite uncovered branch + corner but **must not** fail CI; (3) click Run Review on Security for **this feature’s PR** (no auto-run, no new agent) → trace shows `no-then-chains` and `secret-leakage-gate` or `lethal-trifecta`. Capture the two screenshots named in 4.0 Proof Artifacts. Do not add `pr-self-review`, API Contract Reviewer, or an e2e live-LLM job.
