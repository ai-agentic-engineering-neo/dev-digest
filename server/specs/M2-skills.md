# M2 — Skills (server)

Status: draft

## Problem

The `skills`, `skill_versions` and `agent_skills` tables exist, but no route
writes a skill, and the run executor
(`src/modules/reviews/run-executor.ts`) passes no skills to
`reviewPullRequest`. A user cannot create, edit, version or import a skill.
Linking a skill to an agent has no effect on the prompt, and a run trace cannot
show which skills a review used or how many tokens they added.

## Goals

- A `skills` module with CRUD, version history, restore, and a two-step import
  (preview, then confirm). The database is the source of truth.
- A skill is a name, a description, a type and a markdown body. The description
  is the skill's interface: it is phrased as a directive and is shown to the
  model above the body.
- An agent's links carry their own `enabled` flag and an order. The order is the
  order of the skill blocks in the prompt.
- **Effective skills** are the skills that are linked to the agent, enabled on
  the link, and enabled globally (`skills.enabled`), in link order. They enter
  the prompt and nothing else does. There is no routing by description.
- A run trace records the skills used (id, name, version) and the tokens they
  added. The run log names every effective skill in one line. A disabled skill
  appears in neither.
- A new seeded agent, **Test Quality Reviewer**. Every seeded agent has linked
  skills, and at least one seeded skill is imported. The seed also adds two demo
  PRs for the control experiment.

## Non-goals

- The Context (M5), Evals (M6) and Stats (M7) tabs. No route serves them in M2.
  "Run on evals" and skill eval cases are specified in the M6 draft
  [`M6-eval-dashboard.md`](M6-eval-dashboard.md).
- Pull % and accept % per skill (M7).
- Importing from a URL (`imported_url` stays in the enum, unused), extracting
  skills from the codebase (`extracted`), and a community catalogue
  (`CommunitySkill`). Seeded rows may carry these sources as labels only.
- Executing anything from an import. Scripts and binaries are never
  decompressed, written to disk or run.
- Choosing skills by their description (progressive disclosure). Every
  effective skill is loaded in full.
- The CI runner (`reviewer-core` with `AgentManifest` and
  `.devdigest/skills/<slug>.md`). It keeps reading skills from files.
  Exporting DB skills to files is M8.
- Deleting `eval_cases` whose `owner_id` points to a deleted skill.
  `owner_id` has no foreign key; M6 handles it.

## Behaviour

### Skills CRUD and versions

1. `GET /skills` lists the workspace's skills, oldest first. Each skill has
   `agent_count`: the number of agents whose link to it is enabled. On the list,
   `token_count` is absent.
2. `GET /skills/:id` returns one skill with `token_count`. The value is the
   body counted by the tokenizer adapter (`container.tokenizer`, js-tiktoken
   `cl100k_base`, with a `chars/4` fallback). It counts the body alone, not the
   rendered block.
3. `POST /skills` (`SkillInput`) creates the skill with `source = 'manual'` and
   `version = 1`, and writes the v1 row to `skill_versions` (note `null`) in the
   same transaction. It answers 201.
4. `PATCH /skills/:id` (`SkillUpdate`) is a **content change** when any of
   `name`, `description`, `type` or `body` differs from the stored value. In one
   transaction, a content change applies the patch, sets
   `version = version + 1` and `updated_at = now()`, and inserts a
   `skill_versions` row with all four fields and the optional `note`. A patch
   that only toggles `enabled`, or repeats the stored values, writes no version.
   A primary-key collision on `(skill_id, version)` is surfaced, not retried.
5. `PATCH /skills/:id/enabled` `{ enabled }` toggles the global flag without
   writing a version.
6. `DELETE /skills/:id` deletes the skill. Its versions and agent links go with
   it through the existing `ON DELETE cascade`.
7. `GET /skills/:id/versions` returns `SkillVersion[]`, newest first.
   `GET /skills/:id/versions/:v` returns one version, which the client uses for
   Diff.
8. `POST /skills/:id/versions/:v/restore` copies version `v`'s four fields onto
   the skill as a new version `current + 1`, with the note `Restored from v{v}`.
   History is never rewritten. Restoring the current version answers 400
   `skill_version_current`. An unknown version answers 404.
9. A skill name is unique within a workspace. It is a kebab-case slug, matching
   `^[a-z0-9][a-z0-9-]*$`, at most 64 characters. The client shows it as
   `<name>.md` and it is the heading of the skill's prompt block. A taken name
   answers 400 `skill_name_taken`. A skill from another workspace answers 404.

### Import (preview, then confirm)

1. `POST /skills/import/preview` `{ filename, content_base64 }` parses the
   upload and returns a `SkillImportPreview`. It writes nothing to the database
   or the disk. The file is accepted when its name ends in `.md` or `.zip`;
   anything else answers 400 `import_unsupported_type`.
2. Limits: the decoded upload is at most 1 MB (400 `import_too_large`). A zip
   has at most 200 entries (400 `import_too_many_entries`). Each `.md` entry is
   at most 256 KB, checked against the declared size before inflating and the
   actual size after (400 `import_entry_too_large`). The app's global
   `bodyLimit` is 1 MB (`src/app.ts`), and base64 makes the body about 4/3 of
   the file, so this route sets its own `bodyLimit` of 1.5 MB.
3. An entry path that is absolute, contains `..`, a backslash or a drive
   letter, rejects the whole upload with 400 `import_unsafe_path`. It is not
   skipped silently.
4. Only `.md` entries are decompressed and decoded as UTF-8. Every other entry
   (scripts, binaries, other text) is listed in `skipped_files` with its path and
   uncompressed size, and is never inflated.
5. The core file is `SKILL.md` (any case) at the archive root or inside one
   top-level folder. Otherwise it is the archive's only `.md` file. No `.md`
   file, or several without a `SKILL.md`, answers 400 `import_no_skill_file`.
   A plain `.md` upload is its own core file. Any other `.md` entries go to
   `skipped_files`, with a warning that they were not imported.
6. YAML frontmatter, when present, supplies `name`, `description` and `type`.
   `type` is kept only if it is a `SkillType`; otherwise it falls back to
   `custom` with a warning. A missing name falls back to the file stem, as a
   slug. A missing description gives `""` and a warning, and the user fills it
   in before saving. Other frontmatter keys (`allowed-tools`,
   `disable-model-invocation`, …) are dropped, each with a warning. The body is
   the file without its frontmatter.
7. `POST /skills/import` (`SkillInput`) is the confirm step. It saves the
   edited preview through the same path as `POST /skills`, but with
   `source = 'imported_file'`. Cancelling on the client calls nothing, so
   nothing is saved.
8. The body of an imported skill is trusted instructions, as for any other
   skill. The client shows the warning before confirm. The server adds no
   keyword filter, consistent with the repo rule on untrusted content.

### Agent links

1. `GET /agents/:id/skills` returns `AgentSkillLink[]` in link order, each with
   `enabled`, the skill's `name`, its `type` and its global `skill_enabled`.
2. `POST /agents/:id/skills` accepts one of two bodies:
   - `{ skills: { skill_id, enabled }[] }` replaces the whole set. `order` is
     the array index. It runs in one transaction (`AgentsRepository.setSkills`
     already does).
   - `{ skill_id, order?, enabled? }` links a single skill (upsert, enabled
     defaults to `true`).
   The old `skill_ids` body is removed; no client code calls it. A `skill_id`
   that is not a skill of the workspace answers 400 `unknown_skill`. Today the
   link routes accept any skill id, from any workspace. A duplicate id in
   `skills` answers 400 `duplicate_skill`.
3. Any change to an agent's links (set, link one, reorder, enable) bumps the
   agent's version and writes an `agent_versions` snapshot in the same
   transaction. The snapshot keeps `skills` (ordered ids) and adds
   `skill_links: { skill_id, enabled }[]`, so an eval replay of a past version
   knows which skills were enabled.
4. `Agent.skill_count` is the number of enabled links. `GET /agents` and
   `GET /agents/:id` return it.

### Review run

1. In `runOneAgent`, after the provider is resolved, the executor reads the
   effective skills through a new port, as `{ id, name, description, body,
   version }[]`. That snapshot is used for the whole run, so an edit made
   mid-run does not change it.
2. With at least one skill, the executor calls `formatSkills(skills)` from
   `@devdigest/reviewer-core` and passes the result as `skills` to
   `reviewPullRequest`. `assemblePrompt` joins the blocks with a blank line
   under `## Skills / rules`, outside the untrusted fences. It counts
   `T = tokens.count(blocks.join('\n\n'))`. That string is exactly
   `prompt_assembly.skills`.
3. The run log gets one info line:
   `Loaded N skill(s) (+T tokens): <name> v<version>, …`. With no effective
   skill the line is `No skills enabled for this agent`. A skill that is
   disabled on the link or globally is never named in the log or the trace.
4. The stored trace's `prompt_assembly` gains `skills_tokens = T` and
   `skills_used = [{ id, name, version }]` in link order. Both are `null` when
   the run used no skills, on failed and cancelled runs (`failedTrace`), and in
   `emptyPromptAssembly` (`src/platform/trace-builder.ts`).
5. In map-reduce mode the skills block is repeated in every per-file call.
   `skills_tokens` is the size of one copy; `stats.tokens_in` still reports
   the real total.
6. If reading the skills fails, the run fails, as with any other database
   error in the executor. Skills are not best-effort the way repo-intel context
   is.

### Control experiment (manual, recorded in the milestone PR)

- Test Quality Reviewer on demo PR #483 (happy-path-only test). Run it once
  with its skill links disabled and once with them enabled.
- General Reviewer with the API-contract skills on demo PR #484 (route
  signature change). Run it once without those links enabled and once with
  them.
- For each pair, record the findings and the trace: `skills_tokens` and the
  skills block appear only in the run with skills. The LLM's findings are not
  asserted in tests.

## Changes

- **Module `src/modules/skills/` (new)**, laid out like `agents`:
  - `domain.ts`: `SkillPatch`, `isContentChange`, `restoreNote(v)`, and the
    pure import rules: path safety, limit checks, choosing the core file, and
    mapping frontmatter to fields.
  - `ports.ts`: `SkillStore` (CRUD, versions, `bumpAndSnapshot`,
    `enabledByIds`), `AgentLinks` (the agents module's `enabledLinkCounts`
    and `enabledSkillIds`, wired from `container.agentsRepo`), `TokenCounter`
    (`Pick<Tokenizer, 'count'>`), `ArchiveReader` and `FrontmatterParser`.
    Each module reads only its own tables: `agent_count` is added by the
    service from `AgentLinks.enabledLinkCounts`.
  - `service.ts`, `repository.ts`, `routes.ts`, `index.ts`, and one entry in
    `src/modules/index.ts`.
  - `SkillsService.effectiveSkills(agentId)` is the loading rule: the agents
    port gives the link-enabled skill ids in link order, the store returns the
    globally enabled skills among them, and the service keeps link order. The
    container exposes the service as `container.skillsService` (the skills
    routes and the review run share it) and the repository as
    `container.skillsRepo`, like `agentsRepo`.
- **Adapters (new)**: `src/adapters/skill-import/`.
  - In-memory zip listing and selective inflate with `fflate`, so nothing
    touches the disk and only `.md` entries are inflated.
  - Frontmatter parsing with `yaml`, using the core schema with no custom tags.
  - Both are new dependencies in `server/package.json`. `core-no-packages`
    forbids them inside the module, so they sit behind ports.
- **Tokenizer**: `src/adapters/tokenizer/index.ts` is used outside repo-intel
  for the first time. Update its "ONLY under modules/repo-intel" scope comment.
- **Routes**:

  | Method | Path | Body | Response |
  |--------|------|------|----------|
  | GET | `/skills` | — | `Skill[]` |
  | GET | `/skills/:id` | — | `Skill` (with `token_count`) |
  | POST | `/skills` | `SkillInput` | 201 `Skill` |
  | PATCH | `/skills/:id` | `SkillUpdate` | `Skill` |
  | PATCH | `/skills/:id/enabled` | `{ enabled: boolean }` | `Skill` |
  | DELETE | `/skills/:id` | — | `OkResponse` |
  | GET | `/skills/:id/versions` | — | `SkillVersion[]` |
  | GET | `/skills/:id/versions/:v` | — | `SkillVersion` |
  | POST | `/skills/:id/versions/:v/restore` | — | `Skill` |
  | POST | `/skills/import/preview` | `{ filename, content_base64 }` | `SkillImportPreview` |
  | POST | `/skills/import` | `SkillInput` | 201 `Skill` |
  | GET | `/agents/:id/skills` | — | `AgentSkillLink[]` (changed) |
  | POST | `/agents/:id/skills` | see Agent links | `AgentSkillLink[]` (changed) |

- **Module `agents`** (deliberate exception to "a milestone is a new module";
  the links live here):
  - The store returns link columns only (`skill_id`, `order`, `enabled`);
    `AgentsService.skillLinks` adds `name`, `type` and `skill_enabled` through
    the `SkillLookup` port (`existingIds`, `summaries`, wired from
    `container.skillsRepo`).
  - `AgentsService.updateLinks(workspaceId, agentId, body)` is the one entry
    point of POST `/agents/:id/skills`; it dispatches a `{skills}` body to
    `setSkills(agentId, { skillId, enabled }[])` and a `{skill_id}` body to
    `linkSkill(..., enabled)`.
  - A workspace check on skill ids.
  - `skill_count` in `toAgent`, through a count subquery.
  - Link changes bump the agent version and snapshot `skills` +
    `skill_links` in one transaction.
- **Module `reviews`**:
  - `ports.ts` gains `AgentSkills` (`effectiveSkills(agentId)`) and
    `TokenCounter`.
  - `RunExecutorDeps` gains `skills` and `tokens`, wired in `reviews/routes.ts`
    from `container.skillsService` and `container.tokenizer`.
  - `run-executor.ts` gains the Review run steps above.
- **Tables** (one new migration via `pnpm db:generate`; applied migrations are
  never edited):
  - `agent_skills.enabled`: boolean, not null, default `true`.
  - `skills.updated_at`: timestamptz, not null, default `now()`.
  - Unique index on `skills (workspace_id, name)`.
  - `skill_versions.name`, `description` and `type`: not null. Migration 0014
    adds them with `''`, `''` and `'custom'` defaults so it applies to a
    database with rows; migration 0015 backfills those rows from `skills` and
    drops the defaults.
  - Index on `agent_skills (skill_id)` (migration 0015) for the per-skill
    link counts.
  - `skill_versions.note`: text, nullable.
  - `skills.source` gains `imported_file`. The column is a Drizzle text enum
    with no CHECK constraint in `0000_init.sql`, so this is a TypeScript change
    with no SQL.
- **Contracts** (`contracts/knowledge.ts` and `contracts/trace.ts`, in both
  `server/src/vendor/shared` and `client/src/vendor/shared`, in the same
  commit):
  - `SkillSource` gains `'imported_file'`.
  - `Skill` gains `agent_count` (int), `token_count` (int, nullish, only on
    GET by id), `created_at` and `updated_at` (ISO strings).
  - New `SkillInput`: `{ name, description, type, body, enabled? }`.
    - `name` is a slug, as above.
    - `description` is 1 to 1024 characters.
    - `body` is 1 to 256,000 characters.
  - New `SkillUpdate`: `SkillInput.partial()` plus `note?`, a string of at
    most 200 characters.
  - New `SkillVersion`: `{ version, name, description, type, body, note,
    created_at }`.
  - New `SkillImportPreview`: `{ name, description, type, body, source_file,
    skipped_files: { path, size }[], warnings: string[] }`.
  - `AgentSkillLink` gains `enabled`, `name`, `type` and `skill_enabled`.
  - `AgentVersionConfig` gains `skill_links` (`{ skill_id, enabled }[]`,
    `.nullish()` so pre-M2 snapshots still parse).
  - `Agent` gains `skill_count`, an int with `.default(0)` so that existing
    `Agent` literals in tests and mocks still parse.
  - `PromptAssembly` gains `skills_tokens` (`number | null`) and `skills_used`
    (`{ id, name, version }[] | null`). Both are `.nullish()` so traces stored
    before M2 still parse.
- **Prompt slot**: `reviewPullRequest({ skills })`, which already exists. The
  blocks come from reviewer-core's `formatSkills`, which renders each one as
  `### {name}\n_{description}_\n\n{body}`.
- **Seed** (`src/db/seed.ts` and `src/db/seed-prompts.ts`). Every block is
  idempotent by `(workspace, name)` or by PR number:
  - Skills from the design:
    - `pr-quality-rubric` (rubric, manual), with five versions dated
      2026-03-02 → 2026-05-30. The notes are "Initial rubric", "Added Security
      dimension", "Reworded Correctness checks", "Added Tests dimension" and
      "Tightened scope rule; cap at 5 high-signal findings".
    - `no-then-chains` (convention, extracted).
    - `secret-leakage-gate` and `lethal-trifecta` (security, community).
    - `phantom-api-gate` (security, imported_file, disabled globally).
    - `test-coverage-nudge` (custom, manual).
  - Test-quality skills, for example `branch-coverage-check`,
    `mocking-discipline` and `flaky-test-signals`.
  - API-contract skills, for example `api-contract-compat`, and
    `route-signature-gate` with source `imported_file`, enabled. The enabled
    imported skill meets the "at least one imported" requirement, which the
    disabled `phantom-api-gate` alone would not.
  - Agent **Test Quality Reviewer**: a new `TEST_QUALITY_REVIEWER_PROMPT`
    covering uncovered branches, missed corner cases, over-mocking and
    flakiness, mirrored in
    `docs/agent-prompts/test-quality-reviewer.md`.
  - Links. Security Reviewer exactly as in the agent Skills tab design: all six
    design skills, with `pr-quality-rubric`, `secret-leakage-gate` and
    `lethal-trifecta` enabled (3 of 6). Performance Reviewer:
    `pr-quality-rubric` and `no-then-chains`. General Reviewer:
    `pr-quality-rubric` plus the API-contract skills. Test Quality Reviewer:
    the test-quality skills plus `test-coverage-nudge`. Every agent has at
    least one enabled link. An agent's links are seeded only while it has
    no links and no `agent_versions` snapshot with `skill_links` (every M2 link
    change writes one), so a pre-M2 agent gets them and an agent whose links
    the user cleared does not; a link naming an unknown seed skill throws. The
    resulting `agent_count` values match the design cards: 3, 1, 1, 1 for the
    first four.
  - Demo PRs on `acme/payments-api`, each with real `pr_files` patches.
    `loadDiff` falls back to these patches without a clone.
    - #483 adds an endpoint and a test that covers only the happy path.
    - #484 changes a route's parameter name and response shape.
    - Neither PR has runs, and PR #482's data stays as it is, so flows 02, 04
      and 05 and the M1 seed tests do not change.
- **Env vars**: none.

## Acceptance criteria

- [ ] `POST /skills` creates v1 and a `skill_versions` row. A `PATCH` that
      changes the body returns `version: 2` and writes a v2 row with all
      fields and the note.
- [ ] A `PATCH` that only toggles `enabled`, and `PATCH /skills/:id/enabled`,
      leave `version` and `skill_versions` unchanged.
- [ ] Restoring v1 of a v3 skill creates v4 with v1's content and the note
      `Restored from v1`. Restoring the current version answers 400.
- [ ] `GET /skills` returns `agent_count`, counting enabled links only.
      `GET /skills/:id` returns a positive `token_count`.
- [ ] A duplicate name answers 400 `skill_name_taken`. A skill from another
      workspace answers 404 on every `/skills/:id*` route.
- [ ] Deleting a skill removes its links and versions.
- [ ] `POST /skills/import/preview` with a zip containing `SKILL.md`, `run.sh`
      and `img.png` returns the parsed fields and lists both other files in
      `skipped_files` with their sizes. The skills row count is unchanged, and
      no file is written.
- [ ] A zip entry `../evil.md` answers 400 `import_unsafe_path`. An oversized
      upload or entry, or more than 200 entries, answers 400 with its own code.
- [ ] `POST /skills/import` saves with `source: 'imported_file'`.
- [ ] `POST /agents/:id/skills` with `skills: [{B, true}, {A, false}]` stores
      that order and those flags. `GET` returns them with `name` and `type`.
      A foreign `skill_id` answers 400 `unknown_skill`.
- [ ] `Agent.skill_count` equals the number of enabled links.
- [ ] A run of an agent with one effective skill, one link-disabled skill and
      one globally disabled skill sends a prompt that contains only the
      effective skill's `### name` block. Its trace has `skills_tokens > 0`
      and `skills_used` with that one skill. Its log has
      `Loaded 1 skill(s) (+T tokens)` and does not name the other two.
- [ ] A run with no effective skills has no `## Skills / rules` section,
      `skills_tokens: null` and `skills_used: null`.
- [ ] A trace stored before M2 still parses as `RunTrace`.
- [ ] On a freshly seeded database, run twice:
  - the seed has the six design skills, plus the test-quality and API skills;
  - `pr-quality-rubric` is at v5 with five versions;
  - every agent, Test Quality Reviewer included, has at least one enabled link;
  - at least one enabled skill is `imported_file`;
  - PRs #483 and #484 have patches;
  - PR #482's seeded counts are unchanged.
- [ ] `pnpm typecheck`, `pnpm deps:validate`, and the unit and integration
      lanes pass.

## Tests

See [`TESTING.md`](../../TESTING.md). LLM, GitHub and git are mocked.

- **Unit** (`*.test.ts`, no database):
  - `test/skills-domain.test.ts`:
    - `isContentChange`: an enabled-only toggle and same-value patches are not
      content changes.
    - `restoreNote`.
  - `test/skills-import.test.ts`, with in-memory fixtures and the real adapter:
    - frontmatter mapping, falling back to `custom` and to the file stem;
    - picking the core file (`SKILL.md` versus a single `.md`);
    - non-`.md` entries in `skipped_files`, never inflated;
    - traversal and limit rejections;
    - no `.md` file at all.
  - `test/reviews-skills.test.ts`, with in-memory ports and `MockLLMProvider`,
    following `test/reviews-cancel.test.ts`:
    - the prompt given to the LLM contains the formatted block;
    - the trace's `skills_tokens` and `skills_used`;
    - the log line;
    - the no-skills case (no section, nulls, no skill name in the log).
  - `test/contracts.test.ts`: a pre-M2 `RunTrace` and a pre-M2 `Agent` literal
    parse.
- **Integration** (`*.it.test.ts`, Docker Postgres):
  - `test/skills.it.test.ts`: CRUD, the version bump and snapshot, toggles
    without a bump, restore to v+1, the duplicate name, the cross-workspace
    404, the delete cascade, and that the import preview persists nothing and
    the import confirm sets the source.
  - `test/agents-skills.it.test.ts`:
    - set with order and flags, and the `GET` shape;
    - `unknown_skill`;
    - `skill_count`;
    - `effectiveSkills` excludes link-disabled and globally disabled skills and
      keeps link order. This query is the real loading rule, so it is tested
      against a real database.
  - `test/reviews.it.test.ts`: extend the seed test with the M2 seed
    assertions, after the seed has run twice.
  - `test/response-schemas.it.test.ts`: add the `/skills` GET routes.

## Related specs

- [client/specs/M2-skills.md](../../client/specs/M2-skills.md): `/skills`
  list and detail (Config, Preview, Versions), the import modal, the agent
  Skills tab, and trace tokens.
- [reviewer-core/specs/M2-skills.md](../../reviewer-core/specs/M2-skills.md):
  `formatSkills` and its place in `assemblePrompt`.
- [M6-eval-dashboard.md](M6-eval-dashboard.md) (draft): "Run on evals", the
  skill Evals tab, and eval cases owned by a skill.

## Decisions (approved 2026-11-28)

- Changing an agent's links bumps the agent's version and snapshots
  `skill_links` (see Agent links, step 3).
- `AgentSkillLink` carries the skill's global `skill_enabled`, so the agent
  Skills tab can mark a checked link to a globally disabled skill as inactive.
- Extra `.md` files in an archive stay skipped, with a warning.

## Open questions

- None.
