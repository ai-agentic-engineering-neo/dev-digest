# Skills in the product

Status: implemented
Packages: server, client, reviewer-core (unchanged API), shared contracts

## Goal

A skill is a reusable, versioned block of review instructions (markdown). Users create,
edit and import skills once and attach them to any number of agents; the attached,
enabled skills are appended to the agent's prompt in the order the user chose. A skill
is **text only** — nothing in it is ever executed.

## Scope

In:
- `skills` server module — CRUD, versions (snapshot on body change, restore), preview,
  import preview (markdown file or `.zip`).
- `/skills` page — list on the left (name, type, enabled toggle, delete, description,
  `source · vN`, agent count), detail on the right with tabs **Config / Preview / Versions**.
- "Add skill" modal — **Create** / **From file** (preview → confirm → save).
- Agent editor **Skills** tab — attach/detach (checkbox), reorder (drag), filter.
- Run executor passes enabled linked skills to the engine; run log + trace show the
  skills block and its token count.
- New seeded agent **Test Quality Reviewer**.
- Seeded skill catalog (`server/src/db/seed-skills.ts`, ported from `upstream/lesson-2-lab/skills`)
  linked to Security, Performance and Test Quality reviewers; `phantom-api-gate` is left
  for the live import (`docs/skills-import/phantom-api-gate.zip`).
- `pr-self-review` skill gets `disable-model-invocation: true`.

Out: import from URL, community catalog, Stats/Context/Evals skill tabs, card metrics
(pull freq / accept), demo PRs for the control experiment.

## Data model

Existing tables, no migration:
- `skills` — `version` is the current body version; `enabled` is the global switch
  (off → excluded from every agent).
- `skill_versions (skill_id, version, body)` — immutable body snapshots.
- `agent_skills (agent_id, skill_id, order)` — a row means "attached"; `order` ascending
  is prompt order.

`source` gains `imported_file` (TS enum only — the column is plain `text`).

Version rule: create → v1 snapshot. Update with a **changed body** → `version + 1` +
snapshot. Name/description/type/enabled edits do not bump. Restore vN → update with
vN's body (→ new version, history is never rewritten).

## Contracts (`@devdigest/shared`, server + client copies)

- `SkillSource` += `imported_file`.
- `Skill` += `agent_count: number` (nullish) — attached-agent count for the list.
- `SkillInput` (create), `SkillPatch` (update).
- `SkillVersion { skill_id, version, body, created_at }`.
- `SkillPreview { block, tokens }` — the exact text the agent receives.
- `SkillImportRequest { filename, content_base64 }`.
- `SkillImportPreview { name, description, type, body, files: [{ path, status: 'used'|'skipped', reason? }] }`.
- `RunTrace.skills_used` (nullish) — `[{ id, name, version, tokens }]`.

## Behaviour

### Server — `modules/skills/`

| Route | |
|---|---|
| `GET /skills` | list with `agent_count` |
| `GET /skills/:id` | one |
| `POST /skills` | create (`source` defaults to `manual`) |
| `PUT /skills/:id` | update / toggle enabled |
| `DELETE /skills/:id` | delete (links + versions cascade) |
| `GET /skills/:id/versions` | newest first |
| `POST /skills/:id/versions/:version/restore` | restore → new version |
| `GET /skills/:id/preview` | `SkillPreview` |
| `POST /skills/import/preview` | parse upload, **does not persist** |

Import (pure helper, no filesystem):
- `.md` / `.markdown` — YAML frontmatter `name`, `description` (optional) + body.
  Missing name → first `# heading` → filename.
- `.zip` — only `SKILL.md` (at root or in a single top-level folder) is read. Every other
  entry is listed as `skipped` (scripts, binaries, other docs). Nothing is executed or
  written to disk. Limits: archive ≤ 1 MB, `SKILL.md` ≤ 256 KB uncompressed, ≤ 500 entries.
- Persisting happens only via `POST /skills` after the user confirms the preview;
  imported skills are saved **disabled** (`source: imported_file`) until vetted.

Prompt block for one skill (helper `formatSkillBlock`, also used by the preview):

```
### Skill: <name> (v<version>)
<description>

<body>
```

### Run executor

`agentsRepo.linkedSkills(agentId)` → keep `skill.enabled` → `formatSkillBlock` each →
`reviewPullRequest({ skills })`. Log one `skill` line per attached skill
(`skill attached: <name> v<n> · <tokens> tok`) plus a summary, and record
`trace.skills_used`. Disabled skills are neither logged nor sent.

### Client

- Sidebar: new **SKILLS LAB** group with Skills (`g s`) and Agents.
- `/skills` and `/skills/[id]?tab=config|preview|versions`.
- Config: description hint tells the user to phrase it as a directive (it is the skill's
  interface); body is a mono textarea with a `~N tokens` estimate and the hint "Saving
  a changed body creates a new immutable version."
- Versions: list, **Diff** (line diff vs current, modal), **Restore** (not on current).
- From file: pick `.md`/`.zip` → preview (editable name/description/type, read-only body,
  skipped-files list, trust warning: "an imported skill is someone else's instructions in
  your agent's prompt") → **Save skill** (disabled) / Cancel.
- Agent editor Skills tab: all workspace skills, attached first in order; checkbox =
  attach; drag handle reorders attached ones; badge "N of M enabled"; globally
  disabled skills are marked and skipped at run time.
- Trace → Prompt assembly → Skills block label shows `N skills · T tokens`.

## Acceptance criteria

- [x] A skill can be created, edited, toggled and deleted in the UI.
- [x] Changing the body creates a new version; Diff and Restore work.
- [x] Import of `.md` and `.zip` goes through a preview; nothing is saved before confirm;
      non-`SKILL.md` archive entries are listed as skipped and never executed.
- [x] Test Quality Reviewer exists; skills attach/reorder from the agent's Skills tab.
- [x] An enabled attached skill shows in the run log and in the trace's skills block with
      its tokens; a disabled one does not.
- [x] `pr-self-review` has auto-invocation disabled.

## Open questions

- None blocking.
