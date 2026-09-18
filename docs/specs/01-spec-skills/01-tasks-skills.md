# 01-tasks-skills.md

Source spec: [`01-spec-skills.md`](./01-spec-skills.md) (part 1 of 3). Specs 02 and 03 are not in this task list.

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocated `_components/<Name>/`; tests beside source; `*.it.test.ts` = Postgres; Zod schema+type same name; snake_case REST; `feat:` commits; do-not-touch `vendor/`, applied migrations, lockfiles | Spec 01 explicitly allows a NAV edit in `client/src/vendor/ui/nav.ts` (Sidebar has no injection API). Treat as a **documented exception**, not a silent vendor fork. |
| `README.md` | yes | Studio = client `:3000` + server `:3001`; skills belong in later course lessons; `./scripts/dev.sh` for local stack | none |
| `server/AGENTS.md` | yes | Module slice `routes.ts` → `service.ts` → `repository.ts`; shared contracts live in `server/src/vendor/shared`; `pnpm db:generate` for new migrations; hermetic vs `.it.test` | none |
| `client/AGENTS.md` | yes | Thin `page.tsx`; all API via `src/lib/hooks/*`; `pnpm test` mocks `fetch` | none |
| `TESTING.md` | yes | Behaviour at seams; one real Postgres integration per data-backed workflow; no coverage chasing | none |
| `.github/workflows/server-unit.yml`, `server-integration.yml`, `client.yml` | yes | CI: `pnpm typecheck` + hermetic vitest per package; integration job runs `*.it.test.ts` with Docker | none |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| `.pre-commit-config.yaml` | not found | — | — |
| `server/package.json`, `client/package.json` | yes | `typecheck`, `lint`, `test`; server `db:generate` / `db:migrate` | none |
| `server/eslint.config.js`, `client/eslint.config.mjs` | yes | ESLint per package (`pnpm lint`) | none |

**Assumptions (spec open questions, not blocking):**

1. Performance Reviewer catalog → spec 03; ignored here.
2. Add Skill menu **omits** Import until spec 03 (hide, don’t ship a dead item). Existing `skills.json` import/community keys may stay unused; do not wire UI to them.
3. Preview uses existing `@devdigest/ui` `Markdown` (react-markdown), not a new renderer.

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/vendor/shared/contracts/knowledge.ts` | SoT for `Skill`; add `SkillVersion`; tighten `name`/`description`/`body` min length |
| `client/src/vendor/shared/contracts/knowledge.ts` | Mirror of the shared contracts (required copy, not a second design) |
| `server/src/db/schema/skills.ts` | Additive `note` on `skill_versions` |
| `server/src/db/migrations/` | New file from `pnpm db:generate` only — never edit `0000`–`0013` |
| `server/src/db/rows.ts` | Export `SkillRow` / `SkillVersionRow` like `AgentRow` |
| `server/src/modules/index.ts` | Register the `skills` plugin |
| `server/src/modules/agents/{routes,service,repository,helpers,constants}.ts` | Pattern to copy (workspace scope, version bump, DTO map) |
| `server/src/modules/_shared/context.ts` | `getContext` for workspace/user |
| `server/src/modules/_shared/schemas.ts` | Reuse `IdParams` |
| `server/src/platform/errors.ts` | `NotFoundError` → 404 |
| `server/src/modules/skills/routes.ts` | **New** — HTTP boundary |
| `server/src/modules/skills/service.ts` | **New** — use-cases, no Fastify/Drizzle tables |
| `server/src/modules/skills/repository.ts` | **New** — Drizzle access |
| `server/src/modules/skills/helpers.ts` | **New** — DTO + `isConfigChange` (enabled does not bump) |
| `server/src/modules/skills/helpers.test.ts` | **New** — hermetic bump-rule tests |
| `server/src/modules/skills/constants.ts` | **New** — `INITIAL_SKILL_VERSION = 1` |
| `server/test/skills.it.test.ts` | **New** — Postgres CRUD + versions + restore + cross-workspace 404 |
| `server/test/agents-versions.it.test.ts` | Template for version/404 integration tests |
| `server/test/helpers/pg.ts` | Testcontainers Postgres fixture |
| `client/src/lib/hooks/skills.ts` | **New** — TanStack Query hooks |
| `client/src/lib/hooks/index.ts` | Re-export skills hooks |
| `client/src/lib/hooks/agents.ts` | Hook shape to copy |
| `client/src/lib/api.ts` | `api.get/post/put/del` used by hooks |
| `client/src/vendor/ui/nav.ts` | Documented exception: add Skills Lab item |
| `client/src/components/app-shell/helpers.ts` | `activeKeyFor("/skills")` already returns `"skills"` |
| `client/messages/en/skills.json` | Extend Config/Preview/Versions/Create copy; do not wire Import |
| `client/messages/en/shell.json` | Already has `nav.skills` |
| `client/src/app/agents/**` | Layout/card/editor pattern to reuse, not import across routes |
| `client/src/vendor/ui/primitives/Markdown.tsx` | Preview renderer |
| `client/src/app/skills/page.tsx` | **New** — thin list route |
| `client/src/app/skills/[id]/page.tsx` | **New** — thin editor route |
| `client/src/app/skills/_components/SkillCard/` | **New** — card + tests |
| `client/src/app/skills/_components/SkillsListView/` | **New** — list, search, create |
| `client/src/app/skills/[id]/_components/SkillEditor/` | **New** — tabs Config / Preview / Versions |
| `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/` | **New** |
| `client/src/app/skills/[id]/_components/SkillEditor/_components/PreviewTab/` | **New** |
| `client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/` | **New** |

### Notes
- Tests live beside source (`helpers.test.ts`, `SkillCard.test.tsx`) except server integration (`server/test/*.it.test.ts`).
- Server: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test`, `pnpm lint`.
- Client: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- Copy the agents onion slice; do not import `AgentsService` from skills.
- Do not implement spec 02 (agent bind / prompt) or spec 03 (import / seed / Test Quality).

## Tasks

### [x] 1.0 Skills CRUD module (database is source of truth)

Workspace-scoped Fastify module over the existing `skills` / `skill_versions` tables. Create, read, update, delete; body/type changes version; `enabled` toggle does not.

#### 1.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run src/modules/skills/helpers.test.ts` — `isConfigChange` is true for name/description/type/body and false for `enabled`-only.
- Test: `cd server && pnpm exec vitest run .it.test` — `server/test/skills.it.test.ts` covers: `POST /skills` 201 then `GET /skills` includes the row and `skill_versions` has v1; `GET /skills/:id` 200; unknown id and other-workspace id → 404; `PUT` with empty `description` or `body` → 422; `PUT` body (or type) bumps `version` and inserts `skill_versions` (optional `note` persisted); `PUT { enabled }` does not bump version and adds no snapshot; `DELETE` removes the row (follow-up `GET` is 404).
- CLI: `cd server && pnpm db:generate` appends a **new** migration adding nullable `note` on `skill_versions`. No existing file under `server/src/db/migrations/` is edited.
- CLI: `cd server && pnpm typecheck` passes after contracts + module registration.

#### 1.0 Tasks
- [x] 1.1 In `server/src/vendor/shared/contracts/knowledge.ts`, keep `SkillType` / `SkillSource`; set `Skill.name`, `Skill.description`, and `Skill.body` to `z.string().min(1)`; add `SkillVersion` (`skill_id`, `version`, `body`, `note` nullish, `created_at`) with matching `export type`. Mirror the same edits in `client/src/vendor/shared/contracts/knowledge.ts`.
- [x] 1.2 Add nullable `note: text('note')` on `skill_versions` in `server/src/db/schema/skills.ts`. Run `cd server && pnpm db:generate` (new SQL only). Export `SkillRow` / `SkillVersionRow` from `server/src/db/rows.ts`.
- [x] 1.3 Add `server/src/modules/skills/constants.ts` (`INITIAL_SKILL_VERSION = 1`) and `helpers.ts`: `toSkillDto`, `toSkillVersionDto`, `isConfigChange` (name, description, type, body — **not** enabled). Cover the bump rule in `helpers.test.ts`.
- [x] 1.4 Add `repository.ts`: workspace-scoped list/get/insert/update/delete; on insert write `skills` + `skill_versions` v1; on config change bump version, snapshot `body` + optional `note`; `enabled`-only update skips snapshot. Service must not import Drizzle tables — only the repository does.
- [x] 1.5 Add `service.ts` (create `source: 'manual'`, `enabled` default true) and `routes.ts`: `GET /skills`, `GET /skills/:id`, `POST /skills`, `PUT /skills/:id`, `DELETE /skills/:id`. Validate bodies with Zod at the route (`description`/`body`/`name` min 1, `type` enum). Use `getContext`; missing/foreign workspace → `NotFoundError`. Register the plugin in `server/src/modules/index.ts`.
- [x] 1.6 Add `server/test/skills.it.test.ts` (copy the `startPg` / `seed` / `buildApp` setup from `agents-versions.it.test.ts`) implementing every case listed in 1.0 Proof Artifacts. Do **not** add restore/list-versions routes here — those are 3.x — but assert v1 exists after create.

### [x] 2.0 Skills Lab list + master-detail editor (Config + Preview)

`/skills` and `/skills/:id` reuse the Agents split: cards on the left, Config/Preview on the right. Create, search, toggle, save. Description caption is the skill interface (directive). No Import, no Context/Evals/Stats.

#### 2.0 Proof Artifact(s)
- Test: `cd client && pnpm test` — colocated tests:
  - `SkillCard.test.tsx`: name, type badge, description; enabled=false uses the greyed card style; toggle calls `PUT /skills/:id` with `{ enabled }`.
  - `SkillsListView.test.tsx` (or helpers test): mocked `GET /skills` renders cards; search filters by name/description; Add Skill → Create (no Import item).
  - `ConfigTab.test.tsx`: save sends `{ name, description, type, body }`; empty description does not call `PUT`; caption/hint marks description as the skill interface (directive).
  - `PreviewTab.test.tsx`: heading from **body** is in the document; description text is not rendered as preview content.
- Browser (after `./scripts/dev.sh`): `http://localhost:3000/skills` from the sidebar; Add Skill → Create; card appears; edit body; Preview shows the new heading after save; disable toggle greys the card.
- URL: `http://localhost:3000/skills` and `http://localhost:3000/skills/<id>` reachable; sidebar `activeKey` is `skills` (`app-shell/helpers.ts` already maps `/skills`).

#### 2.0 Tasks
- [x] 2.1 Add `client/src/lib/hooks/skills.ts` (`useSkills`, `useSkill`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`) using `api` + query keys `["skills"]` / `["skill", id]`. Re-export from `client/src/lib/hooks/index.ts`. No `fetch` in components.
- [x] 2.2 Documented NAV exception: in `client/src/vendor/ui/nav.ts` add a Skills Lab item `{ key: "skills", href: "/skills", icon: "Sparkles" }` (label can stay hardcoded like existing items; `shell.json` already has `nav.skills`). Add `g s` shortcut next to `g a` if the `gKey` pattern is used. Do not add Import/community routes.
- [x] 2.3 Extend `client/messages/en/skills.json` with Config / Preview / Create / dirty-unsaved strings and a description caption (“this is the skill interface; write it as a directive”). Change empty-state copy to Create, not Import. Leave unused import keys unreferenced.
- [x] 2.4 Add colocated `SkillCard/` (name, type badge, description, enabled toggle, optional delete matching `AgentCard`). Styles in `styles.ts`. Tests in `SkillCard.test.tsx`.
- [x] 2.5 Add `SkillsListView/` + create modal/form (name, description, type, body). Search via a pure `filterSkills` helper (copy `filterAgents`). Add Skill dropdown: **Create** only. Wire list into thin `client/src/app/skills/page.tsx`.
- [x] 2.6 Add `client/src/app/skills/[id]/page.tsx` (master-detail like `agents/[id]/page.tsx`: list left, editor right, `?tab=`). `SkillEditor` tabs: `config` | `preview` only in this parent (Versions tab mounts in 3.3 but the tab key may already be listed).
- [x] 2.7 `ConfigTab`: name, description + caption, type select (`rubric|convention|security|custom`), markdown body, enabled, unsaved badge, Save → `PUT`. `PreviewTab`: label “as the reviewing agent receives it”; render **body** with `Markdown` from `@devdigest/ui`; do not inject description or fake prompt chrome.
- [x] 2.8 Write the RTL tests named in 2.0 Proof Artifacts (mock hooks like `AgentEditor.test.tsx`). `cd client && pnpm test` green for the new files.

### [x] 3.0 Versions tab (history, Diff, Restore)

Append-only body snapshots. Restore copies an old body forward as a new version. Diff is readable text. Current row has no Restore.

#### 3.0 Proof Artifact(s)
- Test: `server/test/skills.it.test.ts` — `GET /skills/:id/versions` newest-first; `GET .../versions/:n` 200 / unknown version 404; two body saves produce ≥2 version rows; `POST /skills/:id/versions/:version/restore` on v1 sets live `body` to v1 text, inserts a **new** higher version, and leaves the v1 row in place; restore on unknown version or other workspace → 404.
- Test: `cd client && pnpm test` — `VersionsTab.test.tsx`: lists snapshots newest-first with a Current badge; Current has no Restore; confirming Restore calls `POST /skills/:id/versions/:version/restore`; Diff control reveals a text difference between current body and the selected snapshot.
- Browser: skill with ≥2 versions; Diff shows a text difference vs current; Restore v1 then Config/Preview show the restored body.

#### 3.0 Tasks
- [x] 3.1 Extend skills repository/service with `listVersions` (newest first), `getVersion`, `restore(version)` (copy snapshot body onto live skill, bump version, insert new snapshot; optional note e.g. restored-from-vN). No deletes of old `skill_versions` rows.
- [x] 3.2 Add routes: `GET /skills/:id/versions`, `GET /skills/:id/versions/:version`, `POST /skills/:id/versions/:version/restore`. Reuse a `VersionParams` shape like agents. Workspace 404 via `getContext` + agent-style lookup. Add the cases in 3.0 Proof Artifacts to `skills.it.test.ts`.
- [x] 3.3 Add `useSkillVersions` / `useRestoreSkillVersion` in `hooks/skills.ts`. Mount `VersionsTab` on `SkillEditor` (`?tab=versions`). List vN, date, optional note, Current badge; Restore + confirm on older rows only.
- [x] 3.4 Add a colocated pure `diffBodies(a, b)` helper (no new dependency) that yields a readable line-level difference. Diff UI uses it between current `body` and the selected snapshot. Cover `diffBodies` in a sibling `helpers.test.ts`.
- [x] 3.5 Write `VersionsTab.test.tsx` as specified in 3.0 Proof Artifacts (mock hooks). Confirm Current has no Restore button.
