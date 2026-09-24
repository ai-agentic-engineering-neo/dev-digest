# 03 — Skills: reusable prompt rules for agents (server)

UI half: [`client/specs/03-skills.md`](../../client/specs/03-skills.md).
Course slot: **L02 — Skills in the product** (README "What you build").
Status: **approved** (2026-09-22). The open questions are closed. The answers are in **Decisions**.

## Goal

A **skill** is a named, versioned Markdown text, such as a rubric, a house convention or
a security gate. One skill can be linked to many agents. When an agent reviews a PR,
its linked, **enabled** skills go into the prompt in the order the user set. Users
create, import, edit, version, restore, enable/disable and delete skills. Each agent
picks which skills it uses and in what order. The DB is the source of truth.

**A skill is text only.** It has no tools, scripts, model, provider or output schema.
Only `name`, `description` and `body` reach the model (see Rules §5). The
**description is the skill's interface**: a short directive that says *when* the rule
applies ("Flag … when …"). The UI says this in the field hint. `type` and `source`
are metadata.

## Decisions (closed open questions)

| # | Question | Decision |
|---|---|---|
| Q1 | Design tabs | Ship Config · Preview · Versions · **Stats** + the agent Skills tab. Evals stays hidden until L06. |
| Q2 | Pull % / Accept % | **In scope.** The model cites the skill for each finding: `Finding.skill` (nullish, see Contract). Server resolves it to `findings.skill_id`. Stats are computed from that. |
| Q3 | Version message | Auto-generated: `Created`, `Edited body`, `Edited description`, `Edited body and description`, `Restored from vK`, `Imported from <source_ref>`. |
| Q4 | Pin versions per agent | No. Agents always use the **current** body. Each run records the exact versions in `agent_run_skills` + the trace. |
| Q5 | Add Skill menu | Create from scratch · Import from file (`.md` **or `.zip` archive**) · Import from URL · Search community skills. **All in this lesson.** |
| Q6 | Seed links | Yes. Every built-in agent gets its own skills (see Seed). |
| Q7 | Delete when linked | Allowed, behind a confirm modal that lists the agents. |
| T  | Trust of imported skills | **Gate, don't wrap.** See Rules §6. |

## What already exists (reuse, don't rebuild)

| Piece | Where | State |
|---|---|---|
| `skills`, `skill_versions` tables | `src/db/schema/skills.ts` | ✅ exist, unused |
| `agent_skills` link table (`order`) | `src/db/schema/agents.ts` | ✅ exists |
| `GET/POST /agents/:id/skills` | `modules/agents/routes.ts` | ✅ exists, **no workspace check on skill ids** (Rules §4) |
| `Skill`, `SkillType`, `SkillSource`, `CommunitySkill`, `AgentSkillLink` | `vendor/shared/contracts/knowledge.ts` (both copies) | ✅ exist, get extended |
| Engine: `reviewPullRequest({ skills: string[] })` → `## Skills / rules` | `reviewer-core/src/prompt.ts` | ✅ works, incl. every map-reduce chunk |
| Trace `prompt_assembly.skills` | `vendor/shared/contracts/trace.ts` | ✅ field exists, always `null` today |
| Run executor | `modules/reviews/application/run-executor.ts` | ❌ never passes `skills` |
| Versioning pattern (row lock + bump + snapshot) | `AgentsRepository.updateInTx` | ✅ copy it |

**reviewer-core code does not change.** Only the shared `Finding` contract it
consumes gets the optional `skill` field. The reduce/grounding steps pass it through
unchanged (they spread findings). A reviewer-core test pins that.

## Contract (`@devdigest/shared`, update **both** vendored copies)

`SkillSource` = `manual | imported_file | imported_url | community | extracted`
(`imported_file` is new; a `.md` or `.zip` upload).

`Skill` (extend the existing schema):

| Field | Type | Notes |
|---|---|---|
| existing fields | | `version` is the current version |
| `source_ref` | `string \| null` | new. File name, URL, or `community:<id>`. |
| `created_at`, `updated_at` | ISO string | `updated_at` is a new column |
| `used_by` | `number` | count of `agent_skills` rows, computed on read |

```ts
SKILL_BODY_MAX = 20_000; SKILL_DESCRIPTION_MAX = 300
SkillName        = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 1..64          // shown as "<name>.md"
CreateSkillInput = { name, description?: string(max), type, body: string(1..MAX), enabled?,
                     source?: Exclude<SkillSource,'extracted'>, source_ref?: string(max 500) }
UpdateSkillInput = { name?, description?, type?, body?, enabled?, base_version?: int }
SkillVersion     = { skill_id, version, body, description, message, created_at }
SkillAgentRef    = { id, name, enabled }
SkillImportRequest = { kind:'file', filename, content_base64 }   // .md/.markdown/.txt/.zip
                   | { kind:'url', url }
                   | { kind:'community', id }
SkillImportPreview = { name, description, type, body, source, source_ref,
                       included_files: string[], ignored_files: { path, reason }[],
                       warnings: string[] }
CommunitySkill   = existing + { id, type, tags: string[] }
SkillStats       = { skill_id, window_days, runs_attached, runs_cited, pull_rate: number|null,
                     findings, accepted, dismissed, accept_rate: number|null,
                     by_category: {category,count}[], by_severity: {severity,count}[],
                     used_by: SkillAgentRef[] }
SkillStatsSummary = { skill_id, pull_rate, accept_rate, findings }   // list cards
Finding.skill    = string.nullish().describe(...)   // the cited skill name
RunTrace.skills_used = { id, name, version }[] nullish
```

`pull_rate` = `runs_cited / runs_attached`: of the runs where the skill was in the
prompt, the share that produced at least one kept finding citing it. `accept_rate` =
`accepted / (accepted + dismissed)` over findings citing it. Both are `null` when the
denominator is 0. The window is the last 30 days by default (`?days=`, 1..365).

## API (`modules/skills`, onion layout like `modules/reviews`)

| Method | Path | Result |
|---|---|---|
| GET | `/skills` | `Skill[]` for the workspace, `name` asc, with `used_by` |
| GET | `/skills/stats` | `SkillStatsSummary[]` for every skill (list cards), `?days=` |
| GET | `/skills/community` | `CommunitySkill[]`, `?q=&tag=&lang=` filtered, from the built-in catalog |
| POST | `/skills/import/preview` | `SkillImportPreview`. **Persists nothing.** 422 `invalid_import` with a reason. |
| GET | `/skills/:id` | `Skill` · 404 |
| POST | `/skills` | 201 `Skill`. v1 goes into `skill_versions` in the same tx. 409 `conflict` on a duplicate name. |
| PUT | `/skills/:id` | `Skill`. Partial patch. 409 `stale_version` / `conflict`. |
| DELETE | `/skills/:id` | `{ ok: true }`. Links, versions and the skill's eval cases go in one tx. |
| GET | `/skills/:id/versions` | `SkillVersion[]`, newest first |
| GET | `/skills/:id/versions/:version` | `SkillVersion` · 404 |
| POST | `/skills/:id/versions/:version/restore` | `Skill`. Writes the body and description of vK as a **new** version N+1. |
| GET | `/skills/:id/agents` | `SkillAgentRef[]` |
| GET | `/skills/:id/stats` | `SkillStats`, `?days=` |

Every route reads the workspace from `getContext`. A skill from another workspace
returns 404, never 403. Response schemas come from the shared contract.

## Rules

1. **Versioning.** A changed `body` **or `description`** bumps `version` and inserts
   `skill_versions(skill_id, version, body, description, message)`. Both texts reach
   the model, so both are versioned. `name`, `type` and `enabled` update in place.
   Everything runs in one transaction with the skill row `FOR UPDATE`. Sending the
   same text again does not create a version.
2. **Optimistic concurrency.** If `base_version` is sent and differs from the current
   `version`, the server returns 409 `stale_version`.
3. **Name** is unique per workspace (`UNIQUE (workspace_id, name)`). pg `23505` (on
   `err.cause.code`) maps to 409 `conflict`.
4. **Agent links (hardening).** `setSkills` / `linkSkill` reject ids that are not
   skills of the agent's workspace with 422 `unknown_skill`, and the links stay
   unchanged. A link change that actually changes the ordered list **bumps the
   agent version** and snapshots `skills` into `agent_versions`.
5. **Prompt injection.** The executor loads the agent's links ordered by `order`,
   keeps `skills.enabled = true` and renders each skill as
   ```
   ### <name>
   _Applies when:_ <description>        ← line omitted when description is empty

   <body>
   ```
   These blocks are passed as `skills` to `reviewPullRequest`, which joins them into
   `## Skills / rules`. A disabled skill stays linked but is skipped. With zero skills
   the prompt is byte-for-byte today's prompt. Live Log line:
   `skills: 3 attached (pr-quality-rubric v5, …) · ~N tokens` (`estimateTokens`).
   With map-reduce the block repeats in every chunk; the token note says so.
6. **Trust: gate, don't wrap.** A foreign skill is foreign instructions inside the
   agent's prompt. Wrapping it in `<untrusted>` would make the injection guard tell the
   model to ignore it, which defeats the skill. The product gates it instead:
   - import is **preview → explicit confirm**. The preview endpoint persists nothing.
   - a skill created with `source ≠ manual` is always stored `enabled = false`, even
     if the client sends `enabled: true`. Only a later explicit toggle enables it.
   - provenance is kept (`source`, `source_ref`) and shown on the card.
   - import sanitizes and **reports** what it removed: HTML comments (hidden text),
     zero-width and bidi control characters, and an oversized description.
   - executable parts of an archive are **never read**. Only `SKILL.md` (or the
     single root `.md`) is decoded. Every other entry is listed in `ignored_files`
     with a reason (`executable`, `not markdown`, `reference doc`). Nothing is
     written to disk and nothing is executed.
7. **Archive limits.** `.zip` only (via `fflate`, pure JS). Upload ≤ 2 MB base64,
   ≤ 500 entries, the chosen markdown entry ≤ 256 KB uncompressed. Entries are read
   by name, never extracted, so path traversal doesn't apply. Frontmatter (`---`
   YAML-ish `key: value`) supplies `name`, `description` and optional `type`.
   Otherwise name comes from the file or folder name (slugified) and description
   from the first paragraph.
8. **URL import (SSRF).** Only `https:`, port 443, no credentials in the URL. The host
   must resolve **only** to public addresses (loopback, private, link-local, CGNAT
   and ULA are rejected). Manual redirects, at most 3, re-checked each hop. 10 s
   timeout, 1 MB cap. `github.com/<o>/<r>/blob/<ref>/<path>` is rewritten to
   `raw.githubusercontent.com`. A `.zip` response goes through the archive path.
9. **Community catalog.** A curated, vetted list is **shipped in the server**
   (`modules/skills/infrastructure/community-catalog.ts`, bodies inline, with
   attribution `repo`). The server makes no network call to search or import it.
   The imported skill gets `source='community'`, `source_ref='community:<id>'`.
10. **Attribution (stats).** The `Finding.skill` field description tells the model:
    "the exact `###` heading name of the skill under `## Skills / rules` this finding
    enforces, or null". On persist, a name that matches one of the run's attached
    skills gets `findings.skill_id` set. An unknown name is kept in `skill_name` and
    leaves `skill_id` null. `agent_run_skills(run_id, skill_id, skill_version, order)`
    is written when the run starts.
11. **Budget.** `SKILL_BODY_MAX = 20_000` chars per skill, no hard total per agent.

## Migration (one file, `pnpm db:generate`)

- `skills`: `updated_at timestamptz NOT NULL DEFAULT now()`, `source_ref text NULL`,
  `UNIQUE (workspace_id, name)`, `CHECK (length(name) BETWEEN 1 AND 64)`, source check
  gains `imported_file`.
- `skill_versions`: `description text NULL`, `message text NULL`.
- `findings`: `skill_id uuid NULL REFERENCES skills ON DELETE SET NULL`,
  `skill_name text NULL`, index on `skill_id`.
- new `agent_run_skills(run_id → agent_runs CASCADE, skill_id → skills CASCADE,
  skill_version int, "order" int, PK(run_id, skill_id))`, index on `skill_id`.
- Test against a copy of the real DB first (INSIGHTS: pg_dump into a throwaway pg16).

## Seed (`src/db/seed.ts`, idempotent by name)

Skills (all `manual`, v1 with message `Created`): `pr-quality-rubric`, `no-then-chains`,
`secret-leakage-gate`, `lethal-trifecta`, `phantom-api-gate` (disabled),
`n-plus-one-gate`, `test-coverage-nudge`, `mock-discipline`, `corner-case-hunter`.

New built-in agent **Test Quality Reviewer** ("Checks tests for uncovered branches,
missing corner cases, over-mocking and flakiness"). Its prompt goes in `seed-prompts.ts`
and `docs/agent-prompts/test-quality-reviewer.md`.

Links are written only for an agent that has **no** links yet, so re-seeding never
overrides the user's choices:

| Agent | Skills (in order) |
|---|---|
| General Reviewer | pr-quality-rubric, no-then-chains |
| Security Reviewer | secret-leakage-gate, lethal-trifecta, phantom-api-gate |
| Performance Reviewer | n-plus-one-gate |
| Test Quality Reviewer | test-coverage-nudge, mock-discipline, corner-case-hunter |

The "import at least one" path is covered by a sample archive,
`docs/skills-examples/flaky-test-hunter/` (`SKILL.md` + `scripts/detect.sh` +
`references/`). Zipped, it demonstrates that the script is ignored. The walkthrough
imports it and links it to the Test Quality Reviewer.

## Delivery plan

Each step ends green (`pnpm test:unit`, `test:integration`, typecheck, lint,
`arch:check`, `check-shared-drift.sh`).

1. Contracts (both copies) + migration + `rows.ts`.
2. `modules/skills`: domain (name/slug, `isVersionedChange`, version message,
   trust rule, render block, frontmatter + sanitizer, archive picker, URL guard) →
   application (`SkillsService`, `SkillImportService`, ports) → infrastructure
   (`SkillsRepository`, mappers, zip reader, guarded fetcher, catalog) → http → composition.
3. Agent links hardening in `modules/agents`.
4. Executor: port `AgentSkillsReader.enabledForAgent(agentId)`, render blocks, Live Log,
   `agent_run_skills`, trace `skills_used`, finding `skill` → `skill_id` on persist.
5. Stats queries.
6. Seed + Test Quality Reviewer + sample archive + READMEs (`server/README.md` API map,
   `docs/agent-prompts/README.md` skill block format + attribution field).

## Acceptance criteria

1. POST a skill → v1 in `skill_versions`. PUT with a new body → `version=2`, 2 rows.
   PUT changing only `type`/`enabled`/`name` → still `version=2`. PUT with a new
   description → `version=3`.
2. PUT with `base_version=1` when the current version is 2 → 409, the row is unchanged.
3. Restore v1 of a v3 skill → `version=4`, body = v1 body, message `Restored from v1`.
4. Duplicate name in the same workspace → 409. The same name in another workspace → 201.
5. `POST /agents/:id/skills` with a foreign or unknown skill id → 422, links unchanged.
   A valid reorder bumps the agent version, and the snapshot lists the new order.
6. Agent linked to [A(enabled), B(disabled), C(enabled)] in order C, A → the prompt
   has `### C` before `### A` and no B. The trace has `skills_used=[C, A]`. Every
   map-reduce chunk has both.
7. An agent with no linked skills → the prompt equals the pre-feature prompt.
8. DELETE a skill linked to 2 agents → both lose the link, their other links keep
   order, and the skill's eval cases are gone.
9. Every `/skills/:id*` route returns 404 for a skill id from another workspace.
10. Import preview of a zip with `SKILL.md` + `scripts/x.sh` → the body comes from
    SKILL.md, `scripts/x.sh` is in `ignored_files` as `executable`, and nothing is
    persisted. A POST with `source='imported_file', enabled=true` → stored disabled.
11. URL import of `https://127.0.0.1/…`, `http://…` or a host that resolves to
    10.0.0.0/8 → 422. A redirect to a private host → 422.
12. A mock run where the model cites `C` → the finding has `skill_id=C`. Stats for C:
    runs_attached=1, runs_cited=1, pull_rate=1. Accepting the finding → accept_rate=1.

Tests: `test/skills.it.test.ts`, `test/skills-import.test.ts` (unit: zip, frontmatter,
sanitizer, URL guard with a stubbed resolver), `test/skills-domain.test.ts`, executor
cases in `reviews.it.test.ts` using the mock provider.
