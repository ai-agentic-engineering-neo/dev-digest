# Skills (L02) — server

Reusable, text-only review rules that agents link in order and the review
prompt renders under `## Skills / rules`. This file owns the data model, the
API, versioning, the import parser and the prompt/trace contract. The UI half
lives in [`client/specs/skills.md`](../../client/specs/skills.md).

Status: **implemented 2026-09-25** (module `modules/skills/`, seed, tests; no
new migration). Written 2026-09-25.

## Data model (already in the schema)

| Table | Role |
|---|---|
| `skills` | one row per skill: `name` (kebab-case slug, unique per workspace by service rule), `description`, `type` (`rubric` · `convention` · `security` · `custom`), `source` (`manual` · `imported_file` · …), `body` (Markdown), `enabled`, `version` |
| `skill_versions` | immutable body snapshot per version (`skill_id`, `version`, `body`) |
| `agent_skills` | link table with `order`; the agent side is owned by `modules/agents` |

The `source` column is plain `text`, so adding `imported_file` to the enum was
type-only (`drizzle-kit generate` reports no changes).

## API (`modules/skills/routes.ts`)

| Route | Body | Result |
|---|---|---|
| `GET /skills` | — | `Skill[]` ordered by name |
| `GET /skills/:id` | — | `Skill` or 404 |
| `POST /skills` | `{ name, description?, type, body, enabled?, source? }` | 201 `Skill` (v1 snapshotted); 409 on a duplicate name; 422 on a non-slug name, unknown type, empty or >50 000-char body |
| `PUT /skills/:id` | any subset of `{ name, description, type, body, enabled }` | `Skill`; a **meaningful** body change (not whitespace-only) bumps `version` and snapshots it; metadata never bumps |
| `DELETE /skills/:id` | — | `{ ok: true }`; `agent_skills` and `skill_versions` cascade |
| `POST /skills/import/preview` | `{ filename, content_base64 }` (≤ 5 MB decoded) | `SkillImportPreview` — nothing is saved |

Agent side (`modules/agents`, pre-existing routes, new behaviour):

| Route | Change |
|---|---|
| `GET /agents` · `GET /agents/:id` | `Agent.skill_count` (links, any enabled state) |
| `POST /agents/:id/skills { skill_ids }` | every id must exist in the workspace and appear once (422 otherwise); a changed set or order bumps the agent `version` and snapshots `config.skills`; an identical set is a no-op |

## Module shape (onion rings)

`ports.ts` (types + `SkillsRepositoryPort`) → `service.ts` (`SkillsService`,
name uniqueness, body cap, version rule, `previewImport`) → `repository.ts`
(Drizzle, transactions for the versioned writes) · `routes.ts` (Zod schemas,
`getContext` first). `import.ts` is a pure parser over `fflate`. The container
exposes `skillsRepo` typed as the port with a `ContainerOverrides.skillsRepo`
hook for hermetic route tests.

## Import parser (`modules/skills/import.ts`)

- `.md` / `.markdown` / `.txt`: the whole file is the body. Frontmatter
  (`name`, `description`, `type`) is honoured; otherwise the name comes from
  the first `# heading`, then the file name, and the description from the
  first paragraph. Every derivation is reported in `warnings`.
- `.zip`: the core is `SKILL.md`, else `README.md`, else the shallowest `.md`
  (`pickCoreEntry`). Only that entry is decoded. Every other entry is listed
  in `ignored_files`; entries with an executable extension or under `scripts/`
  are counted in a warning. `__MACOSX/`, `.git/` and dot-files are dropped
  from the listing. Nothing is executed, evaluated or written to disk.
- Rejections (422): unsupported extension, empty upload, over 5 MB, unreadable
  zip, zip without a Markdown file, empty body.

The client saves the confirmed preview with `POST /skills { source:
'imported_file' }`; the service forces `enabled: false` for that source
whatever the client sent, so imported skills always start disabled. Only
Markdown entries within the size cap are ever inflated from a zip (the
`unzipSync` filter sees names and declared sizes first), so an archive
cannot expand beyond the cap in memory.
- `PUT /skills/:id` with nothing left to write (empty patch, whitespace-only
  body edit) returns the row unchanged without touching the database.

## Prompt and trace contract

`ReviewRunExecutor.runOneAgent` loads `agentsRepo.linkedSkills(agent.id)`,
logs one line per link (`Skill attached: <name> (vN, N chars)` or
`Skill skipped (disabled on the Skills page): <name>`), renders the enabled
ones with `renderSkillsForPrompt` (`### <name>` + body, link order) and passes
them as `skills` to `reviewPullRequest`. `assemblePrompt` places them under
`## Skills / rules` in the user message, unwrapped (trusted text config), and
records the block in `prompt_assembly.skills`; with no enabled links the slot
and the trace field are absent.

## Seed (`db/seed-skills.ts`)

Thirteen skills and per-agent links (`AGENT_SKILL_LINKS`): Security Reviewer
(3), Test Quality Reviewer (4), API Contract Reviewer (3). The last two agents
are new; their system prompts (`docs/agent-prompts/*.md`, mirrored in
`seed-prompts.ts`) put every concrete check in the skills, so reviewing the
same PR with and without skills is the control experiment. Links are seeded
only while the agent has none, so reordering on a dev DB survives a re-seed.

## Tests

| File | Covers |
|---|---|
| `test/skills-service.test.ts` | uniqueness 409, body cap 422, version bump rule, 404s (in-memory port) |
| `test/skills-import.test.ts` | frontmatter/heading/file-name derivation, zip core selection, ignored executables, rejections |
| `test/skills-routes.test.ts` | route → service → fake port, edge validation, preview route (no DB) |
| `test/reviews-helpers.test.ts` | `renderSkillsForPrompt` order, headings, disabled filtering |
| `test/skills.it.test.ts` | seed contents, CRUD + snapshots, link validation + agent versioning, skills in `prompt_assembly` (Testcontainers) |
