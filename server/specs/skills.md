# spec — skills

A skill is a named, versioned block of review guidance — a rubric, a
convention, a security checklist, or a custom instruction — that can be
attached to one or more agents and folded into their prompt. This is the
canonical spec: the invariants below are behaviour something else already
depends on (the prompt assembler, the trace, the UI), so changing one is a
breaking change, not a refactor.

Architecture context: [`../docs/architecture.md`](../docs/architecture.md).
Prompt assembly: [`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md).
The review flow this feeds into: [`review-flow.md`](review-flow.md).

## Invariants

S1. A skill is text. Nothing from a skill or an import is ever run, written
to disk or fetched.

S2. Prompt = system prompt + the skills that are on at both levels, in
`agent_skills.order`. With no active skills, the prompt is byte-for-byte the
same as today (`reviewer-core/specs/review-contract.md`).

S3. Skill block in the prompt: `### Skill: <name>\n<description>\n\n<body>`.
The description is the skill's interface and is written as a directive.

S4. Any change to name/description/type/body → version+1 + a row in
`skill_versions` (body, note), in a single transaction. Toggling `enabled`
alone does not bump the version.

S5. Restore vN = a normal save with body from vN and the note "Restored from
vN". History is append-only.

S6. An import is always preview → confirm → save; the preview writes nothing
to the DB. An import is saved with `enabled=false`, note "Imported".

S7. Every read and write is scoped by `workspace_id`; a skill from another
workspace → 404.

S8. Building the skill blocks is best-effort: an error is logged, the skills
are left out, and the run completes.

S9. The run writes `skills_used: [{id, name, version, tokens}]` and
`skills_tokens` into `trace.prompt_assembly` (the existing `run_traces.trace`
jsonb). This is the only record of "skill X was in run Y". A disabled skill
does not appear anywhere. Traces written before this change have no field →
they count as runs without skills.

S10. Stats come only from existing tables (30-day window on
`agent_runs.ran_at`; null → "—", never 0 in place of "no data"):

- **Used by** — the count of agents this skill is currently linked to via
  `agent_skills` (enabled or not — "used by" is about attachment, not whether
  it fired on the latest run).
- **Pull frequency** — of the runs in the 30-day window by an agent this
  skill is linked to, the fraction whose trace's `skills_used` actually
  contains this skill's id (a skill can be linked but toggled off per-agent,
  or the run predates skills entirely — both count against the fraction, not
  for it).
- **Accept rate** — of the findings produced by runs in the 30-day window
  where this skill appears in `skills_used`, the fraction that were accepted
  (`findings.accepted_at is not null`) rather than dismissed or left
  untouched. Null when the skill produced no findings in the window, never 0.
- **Findings (30d)** — the count of findings from runs in the 30-day window
  where this skill appears in that run's `skills_used`.
- **By category** — the same 30-day findings count, grouped by
  `findings.category`, for runs where this skill appears in `skills_used`.

## Data model

Two tables, extending the existing schema (`server/src/db/schema/skills.ts`,
`server/src/db/schema/agents.ts`):

| Table | Columns | Notes |
|---|---|---|
| `skills` | `id, workspace_id, name, description, type ('rubric'\|'convention'\|'security'\|'custom'), source ('manual'\|'imported_url'\|'extracted'\|'community'), body, enabled, version, evidence_files, created_at` | `body`/`version` hold the CURRENT text — the live row, not history. |
| `skill_versions` | `skill_id, version, body, note, created_at` | PK `(skill_id, version)`. Append-only; never updated or deleted except by cascade when the skill itself is deleted (S5). |
| `agent_skills` | `agent_id, skill_id, order, enabled` | PK `(agent_id, skill_id)`. The join table S2's ordering and per-agent on/off state live on. |

`evidence_files` is an optional array of file paths supporting the skill
(e.g. extracted-from files); it is metadata only and never read at prompt
time.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/skills` | list + `agent_count`, `pull_rate`, `accept_rate` for the cards |
| GET | `/skills/:id` | |
| POST | `/skills` | `{name, description, type, body, source?, note?}` |
| PUT | `/skills/:id` | partial + `note?`; S4 |
| DELETE | `/skills/:id` | links are removed by cascade |
| GET | `/skills/:id/versions` | `[{version, note, created_at, current}]` newest first |
| GET | `/skills/:id/versions/:v` | body of the version (for Diff) |
| POST | `/skills/:id/versions/:v/restore` | S5 |
| GET | `/skills/:id/stats` | S10 + `agents:[{id,name}]` + `by_category` |
| POST | `/skills/tokens` | `{text}` → `{tokens}` (live counter in the editor) |
| POST | `/skills/import/preview` | `{filename, content_base64}` → `{name, description, type, body, ignored_files[], warnings[]}`; limit 1 MB / 200 entries |
| GET | `/agents/:id/skills` | all workspace skills: linked ones in `order`, then the rest (`linked:false`) |
| PUT | `/agents/:id/skills` | `{items:[{skill_id, enabled}]}` — full ordered list, transaction + workspace check |

## Import parsing rules

An import accepts either a single `.md` file or a `.zip` archive (per S1,
size-capped at 1 MB / 200 entries so a hostile or oversized archive cannot
be used to exhaust memory or disk during preview):

1. **Only text is ever read.** The parser looks for exactly one skill
   definition file inside the archive — by convention `SKILL.md` at the
   archive root, or the single `.md` file when there is only one — and reads
   it as UTF-8 text. Every other entry in the archive (scripts, binaries,
   images, nested folders) is listed in the response's `ignored_files` and is
   never executed, written to disk outside the parse buffer, or fetched over
   the network (S1). A `run.sh`, `install.sh`, or any other executable inside
   the archive is inert cargo as far as the importer is concerned.
2. **Frontmatter, when present, seeds the structured fields.** A leading
   `---`-delimited YAML block supplies `name`, `description`, and `type`; the
   remainder of the file becomes `body`. When there is no frontmatter, the
   first `#`-heading becomes `name`, the first paragraph becomes
   `description`, and the whole file becomes `body` — with a warning noting
   the fields were inferred, not declared.
3. **The preview is read-only.** `POST /skills/import/preview` computes
   `{name, description, type, body, ignored_files[], warnings[]}` and returns
   it; nothing is written to the database at this step (S6). The caller
   reviews and edits the parsed fields, then a separate save (`POST
   /skills`) persists them.
4. **A saved import starts disabled.** Per S6, the skill this produces is
   inserted with `enabled=false` and a `skill_versions` note of "Imported" —
   an operator must deliberately turn it on (and, per S4, deliberately attach
   it to an agent) before it affects any run.
5. **Unparseable or oversized input fails closed.** An archive over the
   1 MB / 200-entry cap, one with no discoverable `.md` file, or a file that
   is not valid UTF-8 text returns a 422 with a warning explaining why —
   never a partial or best-guess skill.
