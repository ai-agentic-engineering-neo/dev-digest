# Skills — server (+ reviewer-core, shared contracts, seed)

Client half: [../../client/specs/skills.md](../../client/specs/skills.md).

## Goal

Reusable, **text-only** review rules ("skills") that several agents share. A skill is
name + type + description (its interface) + markdown body. Linked to agents with an
order; enabled linked skills are appended to the agent's prompt as separate blocks, in
that order. The DB is the source of truth. A skill never runs code or uses tools.

## Background

- `skills`, `skill_versions`, `agent_skills` already existed in `0000_init`. v2 (Stats / Versions
  designs) adds migration `0013`: table `run_skills` + column `skill_versions.note`.
- Per-agent "checked" = linked (`agent_skills` row). The skill's own `enabled` flag is
  global: a disabled skill is not added to any agent's prompt.
- Vendor contracts: only NEW types were added (approved by the user, 2026-11-05).

## Scope

### Module `src/modules/skills/` (onion: domain → ports → repository/service → routes)
| Route | Behaviour |
|---|---|
| `GET /skills` | workspace's skills, by name |
| `GET /skills/usage` | `{ [skillId]: linkedAgentCount }` |
| `GET /skills/:id` | one skill (404 outside the workspace) |
| `POST /skills` | create, source `manual` (trusted); name kebab-case, unique per workspace (409) |
| `PUT /skills/:id` | partial update; a content change (name/description/type/body) bumps `version` and snapshots `skill_versions`; toggling `enabled` does not |
| `DELETE /skills/:id` | delete; `agent_skills` links cascade |
| `GET /skills/:id/versions` | body history, newest first: `{ skill_id, version, body, note, created_at }` |
| `GET /skills/:id/stats` | v2 — Stats tab (see below) |
| `GET /skills/stats` | v2 — `{ [skillId]: { agents, pull_rate, accept_rate } }` for the list cards |
| `POST /skills/import/preview` | `{ filename, content_base64 }` → `SkillImportPreview`; **saves nothing** |
| `POST /skills/import` | same upload + optional `name/description/type` edits → re-parsed server-side and saved with source `community` (untrusted) |

`POST /skills` / `PUT /skills/:id` accept an optional `note` (≤ 200 chars, "what changed") stored on
the version row a content change creates; without it the server writes `Initial version` (v1) /
`Updated` (later). **Restore** = `PUT /skills/:id { body: <old body>, note: "Restored from vN" }` —
a new version, history is never rewritten.

Linking stays in the agents module (`POST /agents/:id/skills`), now rejecting skill ids
outside the workspace (404) and duplicates (422).

### Import (`import/skill-import.ts`, `import/zip-reader.ts`, `import/frontmatter.ts`)
- `.md` / `.markdown` / `.txt`, or `.zip` (detected by extension or `PK\3\4` magic). Max 1 MiB upload.
- ZIP read in memory, nothing written to disk: ≤ 200 entries, ≤ 256 KiB per entry, ≤ 2 MiB total,
  inflate capped (`maxOutputLength`), ZIP64 / encrypted / unknown methods refused.
- Entry = shallowest `SKILL.md`, else the only markdown file; other markdown/text files are
  appended as `## Reference: <path>`.
- **Executable parts are never processed**: scripts/binaries (by extension or unix `+x`), unsafe
  paths (`..`, absolute, backslash — zip-slip) and other types are listed as `ignored` with a reason.
- Frontmatter: `name`, `description`, `type` used; unknown keys (e.g. `allowed-tools`) reported as
  ignored. Non-kebab names are slugified with a warning; an unknown type → `custom`.

### Prompt (reviewer-core `prompt.ts`)
- `skills?: SkillInput[]` where `SkillInput = string | { name, body, trusted: false }`.
- Trusted strings are rendered as-is (server formats `### <name>` + body).
- Imported → `<untrusted source="skill:<name>">…</untrusted>` + `IMPORTED_SKILL_GUARD` appended to
  the system message (criteria only; can't change role/output/severity or suppress findings).

### Executor (`reviews/run-executor.ts`)
`loadPromptSkills` → `container.skillsRepo.promptSkillsForAgent(workspaceId, agentId)` (enabled,
link order) → `toSkillInputs` → `reviewPullRequest({ skills })`. Log line
`Skills: N attached — a, b (imported) (~T tokens)` (cl100k count); trace `prompt_assembly.skills`.

### Seed
Test Quality Reviewer + API Contract Reviewer (lean prompts — role + output rules only), built-in
skills (`src/db/seed-skills.ts`) linked per agent. Idempotent by name; links only created for skills
inserted in that run (a link the user removed is not re-added).

### v2 — run attribution + Stats (designs "Skills · Stats / Versions")
- **`run_skills`** (`run_id` → agent_runs cascade, `skill_id` → skills cascade, `skill_version`,
  `position`; PK run+skill). The executor writes one row per skill that went into the prompt, right
  after `loadPromptSkills`, best-effort (a failed insert is logged, never fails the run). No
  `workspace_id` — scoped through the skill (workspace-checked first).
- Stats only cover runs made after this change (older runs have no attribution) — the UI says so.
  The window starts at the workspace's **first attributed run** (or 30 days ago, whichever is later),
  so pre-attribution runs never read as "skill not used"; with no attributed run yet, rates are `null`.
- `GET /skills/:id/stats` (404 outside the workspace), window = last 30 days by `agent_runs.ran_at`:
  - `used_by`: agents linked now — `[{ id, name }]` (count = length).
  - `pull_rate`: runs that included the skill ÷ runs of agents linked now **or** that included it
    (so it never exceeds 1); `null` when there were no such runs. Shows how often the skill really
    reaches the prompt (globally disabled or unlinked for a while → lower).
  - `findings_30d`: findings (kind `finding`) of reviews whose `run_id` included the skill.
  - `accept_rate`: accepted ÷ (accepted + dismissed) among those findings; `null` with no decisions.
  - `by_category`: `[{ category, count }]`, most first. (The design shows `$` amounts — we show
    counts; findings have no cost.)
  - `runs_30d`, `window_days: 30`.
- Attribution is correlation: a finding is counted for every skill that was in that run's prompt.
- `GET /skills/stats` returns the three card numbers for every skill in one query set.

## Acceptance criteria
1. CRUD + versioning + 409 on duplicate name — `test/skills-routes.it.test.ts`.
2. Preview saves nothing; confirm saves `community`; scripts in an archive are `ignored` — same test +
   `test/skills-import.test.ts` (zip bomb, lying sizes, zip-slip, `+x`, magic number).
3. Disabled skill is not in `promptSkillsForAgent`; order = link order; imported → `trusted: false`.
4. Cross-workspace skill link → 404.
5. reviewer-core: imported skill wrapped + guard only when present — `reviewer-core/test/prompt.test.ts`.
6. `node scripts/check-architecture.mjs` — no new layer violations.
7. v2: a review run writes `run_skills` for the enabled linked skills only (with their versions);
   stats compute pull/accept/findings/by-category over 30 days; a skill of another workspace → 404 —
   `test/skills-stats.it.test.ts`.
8. v2: version `note` is stored (default `Initial version` / `Updated`); restore creates v(n+1) with
   the old body and note `Restored from vN`.

## Control experiment (manual, needs an LLM key)
1. Test Quality: a PR whose new function has an error branch but only a happy-path test. Run
   Test Quality Reviewer with all skills unchecked → expect no finding on the branch; check
   `untested-branches` + `boundary-cases` → expect a WARNING naming the uncovered branch / edge case.
2. API Contract: apply `docs/experiments/api-contract-breaking-change.patch` (route renamed, response
   shape changed, no version bump) — full steps in `docs/experiments/README.md`. Without skills →
   likely missed; with `breaking-change`, `response-schema`, `semver-discipline` (+ imported
   `deprecation-policy`) → CRITICAL.
3. Open the run trace → Prompt assembly → **Skills** block (`~N tokens`); the Live Log shows
   `Skills: N attached … (~T tokens)`. With the skill disabled the block/line are absent.
