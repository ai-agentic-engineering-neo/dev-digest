# 01-spec-skills.md

Part 1 of 3. Follow-on: [02 agent binding](../02-spec-skills-agent-binding/02-spec-skills-agent-binding.md), [03 import and Test Quality](../03-spec-skills-import-and-test-quality/03-spec-skills-import-and-test-quality.md).

## Introduction/Overview

A skill is a reusable markdown instruction that many agents can share. Today the database already has `skills` / `skill_versions` tables and a Zod `Skill` contract, but there is no CRUD module and no Skills Lab UI — agents cannot author or edit skills. This spec adds the library: server CRUD with the database as source of truth, and a Skills page that mirrors the Agents master-detail editor (Config, Preview, Versions).

## Goals

- A user can create, edit, enable/disable, and delete a skill whose only payload is name, description, type, and markdown body.
- The Skills Lab list shows every workspace skill as a card; selecting one opens the editor beside the list.
- Every save of the body creates an immutable version snapshot; the user can diff and restore older versions.
- Description is treated as the skill’s human-facing interface (directive, required) and is **not** injected into the review prompt (prompt wiring is spec 02).

## User Stories

- **As a reviewer author**, I want to write a skill once in markdown so several agents can reuse the same rule.
- **As a reviewer author**, I want a description field with a hint that it is the skill’s interface, so I phrase it as an instruction, not a blurb.
- **As a reviewer author**, I want to preview the rendered markdown the way a reading agent will see the body, so I can check structure before saving.
- **As a reviewer author**, I want version history with diff and restore, so a bad edit is reversible and old evals can be reasoned about against the exact text.

## Demoable Units of Work

### Unit 1: Skills CRUD module (database is source of truth)

**Purpose:** Give the studio a workspace-scoped API for skills, following the agents module shape (`routes.ts` → `service.ts` → `repository.ts`).

**Functional Requirements:**
- The system shall register a `skills` Fastify module in `server/src/modules/index.ts` with workspace-scoped CRUD:
  - `GET /skills` — list
  - `GET /skills/:id` — one skill
  - `POST /skills` — create (`source` = `manual`, `enabled` default true, `version` = 1)
  - `PUT /skills/:id` — update name, description, type, body, enabled
  - `DELETE /skills/:id` — delete (existing `ON DELETE CASCADE` on `agent_skills` / `skill_versions` removes links and history)
- The system shall persist through the existing `skills` table. A body (or type) change shall bump `skills.version` and insert a `skill_versions` row with that version’s body. Toggling `enabled` alone shall not bump version (same rule agents use for `enabled`).
- The system shall add an optional `note` text column on `skill_versions` (nullable) so a save can carry a short human summary. If the client omits `note`, the snapshot still saves.
- The system shall validate at the HTTP boundary with Zod contracts in `server/src/vendor/shared` (mirrored to the client): `description` min length 1; `type` is `rubric | convention | security | custom`; `body` min length 1.
- The system shall return 404 when the skill is missing or belongs to another workspace.

**Proof Artifacts:**
- Hermetic/integration tests on the new module: create → get → list includes it; update body bumps version and writes `skill_versions`; enable toggle does not bump version; delete removes the row; foreign workspace id → 404.
- `pnpm db:generate` produces a **new** migration for `skill_versions.note` and any `agent_skills` changes deferred to spec 02. Existing migration files are not edited.

---

### Unit 2: Skills Lab list + master-detail editor (Config + Preview)

**Purpose:** Reuse the Agents page pattern so a user can browse and edit skills without a new interaction model.

**Functional Requirements:**
- The user shall open `/skills` and `/skills/:id` (thin `page.tsx` + colocated `_components/`). The layout is list on the left, editor on the right — same split as `/agents/:id`.
- The system shall show each skill as a card: name, type badge, description, enabled toggle. Search filters the list by name/description. Clicking a card navigates to `/skills/:id`.
- The user shall create a skill via **Add Skill → Create**. (Import is spec 03; the dropdown may show Import disabled or omitted until then.)
- The Config tab shall contain: name, description (with a caption that this field is the skill’s interface and should be written as a directive), type select, markdown body editor, enabled toggle.
- The Preview tab shall render the **body** as markdown (existing `react-markdown`), labelled as what the reviewing agent receives. Description is not part of that preview.
- The editor shall show a dirty/unsaved affordance while local fields differ from the last saved skill, and persist via `PUT /skills/:id`.
- The system shall add a Skills item to the Skills Lab sidebar so `/skills` is reachable. `client/src/vendor/ui/nav.ts` currently lists only Pull Requests and Agents and is vendored; if Sidebar has no injection API, this spec **explicitly allows** a NAV edit in that file as the exception, rather than forking the shell.
- Data fetching shall go through `client/src/lib/hooks/skills.ts` (TanStack Query), not ad-hoc `fetch` in components. i18n keys live under `client/messages/<locale>/skills.json` (keys already exist; extend, don’t invent a second namespace).

**Proof Artifacts:**
- Component tests: list renders cards from mocked `GET /skills`; toggle calls `PUT` with `{ enabled }`; Config save sends name/description/type/body; Preview shows rendered headings from the body; empty description is rejected (no save).
- Browser: create a skill, see it in the list, edit body, Preview updates after save, disable toggle greys the card analogously to agents.

---

### Unit 3: Versions tab (history, Diff, Restore)

**Purpose:** Make body edits reproducible, matching the Versions mockup and the existing `skill_versions` table.

**Functional Requirements:**
- The system shall expose:
  - `GET /skills/:id/versions` — newest first
  - `GET /skills/:id/versions/:version` — one snapshot
  - `POST /skills/:id/versions/:version/restore` — copy that snapshot’s body onto the live skill, bump version, write a new snapshot (history is append-only; restore does not delete old rows)
- The Versions tab shall list vN, date, optional note, a Current badge on the live version, and Diff / Restore actions on older rows.
- Diff shall show a readable text difference between the selected snapshot body and current (or between two snapshots). Restore shall confirm before running.
- Creating a skill writes `skill_versions` v1 with the initial body.

**Proof Artifacts:**
- API test: two body saves → two version rows; restore v1 → live body equals v1 and a new higher version exists.
- Component test: Versions tab lists snapshots; Current has no Restore; confirming Restore calls the restore endpoint.

## Non-Goals (Out of Scope)

1. **Agent binding, prompt assembly, run traces:** spec 02.
2. **File/archive import, URL/community catalog:** spec 03. URL and community stay out of this series.
3. **Context / Evals / Stats / CI tabs** on the skill editor, and card stats (agent count, pull%, accept%).
4. **Attaching Project Context documents to a skill.** A skill is markdown configuration only — no tools, scripts, or extra files at runtime.
5. **Test Quality Reviewer and seeded demo catalog:** spec 03.
6. **Token counting in the editor** is optional polish; if added, one shared estimator reused in spec 02’s trace, not two formulas.

## Design Considerations

Layout and chrome follow the supplied Skills Lab mockups and the existing Agents editor: left card list, right tabbed editor, type colour badges (`rubric` / `convention` / `security` / `custom`), enabled toggle on the card. Caption under Description states it is the skill interface and should be written as a directive. Do not build Context/Evals/Stats even if they appear on the mockup.

## Repository Standards

- Server: onion slice `modules/skills/{routes,service,repository}.ts`; routes validate with Zod and call one service method; service does not import Fastify or Drizzle tables.
- Shared contracts: edit `server/src/vendor/shared/contracts/knowledge.ts`, mirror to `client/src/vendor/shared`. Schema constant and type share one name (`Skill`, `SkillVersion`). REST fields snake_case.
- Client: thin `page.tsx`; feature folder `_components/<Name>/` with `styles.ts`, `helpers.ts`, `constants.ts`, tests beside the component. Hooks in `src/lib/hooks/`.
- Tests: hermetic `*.test.ts` next to code; `*.it.test.ts` for Postgres. Do not hand-edit applied migrations.
- Commits: `feat:` / `fix:` prefixes.

## Technical Considerations

- Tables `skills` and `skill_versions` already exist. Do not recreate them. Only additive migrations (`note` on versions).
- `SkillSource` already includes `manual | imported_url | extracted | community`. This spec only writes `manual`. File import adding a source value is spec 03.
- Agent editor versioning (`snapshotVersion` on config change, not on enable) is the pattern to copy. Agents have no Restore endpoint; skills do, because the Versions mockup requires it.
- Preview is the body only. Prompt assembly (order, enabled flags, `## Skills / rules`) is spec 02 — Preview must not pretend to inject agent context.

## Security Considerations

- Skills are workspace-scoped; every route uses `getContext` like agents. No cross-workspace read/write.
- Body is stored as text, never executed. Markdown preview must use the existing renderer (no `dangerouslySetInnerHTML` of raw body).
- No secrets belong in a skill body; none are required for this spec.

## Success Metrics

1. A new skill created in the UI appears in `GET /skills` and on the list without a seed script.
2. Editing the body increments `version` and adds a `skill_versions` row; restore brings the old body back as a new version.
3. Disabled skill remains in the list but is visually off (toggle), matching agent cards.

## Open Questions

1. Performance Reviewer’s skill set is not on the mockups — deferred to spec 03 (seed), not this library.
2. Whether the Add Skill dropdown shows a disabled “Import” item before spec 03, or hides it — implementer choice, no behaviour change.
