# Skills — server (+ reviewer-core, shared contracts, seed)

Client half: [../../client/specs/skills.md](../../client/specs/skills.md).

## Goal

Reusable, **text-only** review rules ("skills") that several agents share. A skill is
name + type + description (its interface) + markdown body. Linked to agents with an
order; enabled linked skills are appended to the agent's prompt as separate blocks, in
that order. The DB is the source of truth. A skill never runs code or uses tools.

## Background

- `skills`, `skill_versions`, `agent_skills` already existed in `0000_init` — **no migration**.
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
| `GET /skills/:id/versions` | body history, newest first |
| `POST /skills/import/preview` | `{ filename, content_base64 }` → `SkillImportPreview`; **saves nothing** |
| `POST /skills/import` | same upload + optional `name/description/type` edits → re-parsed server-side and saved with source `community` (untrusted) |

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
Test Quality Reviewer + API Contract Reviewer (lean prompts — role + output rules only), 8 built-in
skills (`src/db/seed-skills.ts`) linked per agent. Idempotent by name; links only created for skills
inserted in that run (a link the user removed is not re-added).

## Acceptance criteria
1. CRUD + versioning + 409 on duplicate name — `test/skills-routes.it.test.ts`.
2. Preview saves nothing; confirm saves `community`; scripts in an archive are `ignored` — same test +
   `test/skills-import.test.ts` (zip bomb, lying sizes, zip-slip, `+x`, magic number).
3. Disabled skill is not in `promptSkillsForAgent`; order = link order; imported → `trusted: false`.
4. Cross-workspace skill link → 404.
5. reviewer-core: imported skill wrapped + guard only when present — `reviewer-core/test/prompt.test.ts`.
6. `node scripts/check-architecture.mjs` — no new layer violations.

## Control experiment (manual, needs an LLM key)
1. Test Quality: a PR whose new function has an error branch but only a happy-path test. Run
   Test Quality Reviewer with all skills unchecked → expect no finding on the branch; check
   `untested-branches` + `boundary-cases` → expect a WARNING naming the uncovered branch / edge case.
2. API Contract: a PR that renames a response field or adds a required body field. Without skills →
   likely missed; with `route-breaking-changes` (+ imported `api-versioning-policy`) → CRITICAL.
3. Open the run trace → Prompt assembly → **Skills** block (`~N tokens`); the Live Log shows
   `Skills: N attached … (~T tokens)`. With the skill disabled the block/line are absent.
