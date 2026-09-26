# spec — conventions

The Conventions Extractor scans a repo's clone for recurring coding
conventions, lets a human review each candidate (accept / reject / edit),
and merges the accepted ones into an editable `repo-conventions` skill. This
is the canonical spec: the invariants below are behaviour something else
already depends on (the skill it produces, the Skills tab it lands in), so
changing one is a breaking change, not a refactor.

Architecture context: [`../docs/architecture.md`](../docs/architecture.md).
The skill this feature produces: [`skills.md`](skills.md).
The client page: [`../../client/specs/pages.md`](../../client/specs/pages.md).

## Invariants

| # | Rule |
|---|---|
| C1 | Sample selection is code only, with no LLM: configs (`.eslintrc*`, `eslint.config.*`, `tsconfig*.json`, `.prettierrc*`, `prettier.config.*`, `.editorconfig`) found in the clone, plus the top 12 files from `repoIntel.getConventionSamples(repoId, 12)`. Each file is capped at about 400 lines / 16 KB, and the whole prompt at about 60 KB. |
| C2 | One structured LLM call (`schemaName: 'ConventionExtraction'`) on the model from `resolveFeatureModel(container, workspaceId, 'conventions')`. Output: `{candidates: [{category, rule, evidence: {path, start_line, end_line}, confidence 0..1}]}`. |
| C3 | Evidence is verified in code, never trusted from the model. The path must be one of the sampled files and exist in the clone (no path traversal: resolve it, then check it is inside `clonePath`). `1 ≤ start ≤ end ≤ lineCount`, the span is at most 30 lines, and the lines are not all blank. Anything that fails is dropped and counted in `dropped`. The stored snippet is read from the clone, never taken from the model's own output. |
| C4 | Candidates reach the DB only after C3 passes. The UI never shows an unverified candidate. |
| C5 | Status is `pending \| accepted \| rejected`. Rejected candidates are hidden from the list, can never be merged into a skill, and survive a reload. |
| C6 | Re-scan, in one transaction: delete `pending` candidates for the repo, then insert the new verified ones, except those whose `normalize(rule)` (lowercase, collapse whitespace, strip punctuation) equals an existing accepted or rejected rule for that repo. |
| C7 | The skill is created only from `accepted` candidates, in the order they appear in the list. The server rebuilds the default body from the template below. The client may send an edited body instead; the server stores exactly what it is sent. |
| C8 | Creating a skill writes `source='extracted'`, `type` defaulting to `'convention'`, `evidence_files` = the unique evidence paths of the accepted candidates, and version note `"Extracted from conventions"`. It does not link the skill to any agent — linking happens only through `PUT /agents/:id/skills` (see `skills.md`). |
| C9 | Everything is scoped by `workspace_id`. A repo or candidate belonging to another workspace returns 404. |
| C10 | An LLM or parse failure marks the scan `failed`, records `error`, and leaves the existing candidates untouched. A repo with no clone or no ranked files yet (not indexed) returns 409 before any LLM call is made. |

## Data model

Migration is drizzle-kit generated (`pnpm db:generate`), never hand-edited.

- **`convention_scans`** (new): `id, workspace_id, repo_id, sha, model, provider, status ('ok'|'failed'), sample_files jsonb, candidates_found int, candidates_dropped int, error text, created_at`.
- **`conventions`** (existing table, extended): add `scan_id` (fk → `convention_scans.id`, `on delete set null`), `category text`, `evidence_start_line int`, `evidence_end_line int`, `status text default 'pending'`, `created_at`, `updated_at`. Backfill `status` from the existing `accepted` boolean (`true → 'accepted'`, `false → 'pending'`), then drop `accepted`. The table has no rows in any environment yet (the seed doesn't touch it), so this backfill is a formality, not a real migration risk.
- **Contracts** (`ConventionCandidate`, both `vendor/shared` copies — see `server/INSIGHTS.md` on drift): `{id, category, rule, evidence_path, evidence_start_line, evidence_end_line, evidence_snippet, confidence, status}`, plus `ConventionScan` and `ConventionList = {scan: ConventionScan|null, repo: {full_name}, candidates: ConventionCandidate[]}`.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/repos/:id/conventions/extract` | Runs C1–C6 synchronously (about a 90s timeout). Returns `ConventionList` plus `{dropped: number}`. |
| GET | `/repos/:id/conventions` | Latest scan and all non-rejected candidates. |
| PATCH | `/conventions/:id` | `{status?, rule?, category?}`. The evidence itself (path/lines/snippet) can never be edited — only the human-facing rule text and category. |
| POST | `/repos/:id/conventions/skill/preview` | Returns `{name: 'repo-conventions', description, type: 'convention', body, accepted_count, name_taken_by?: skillId}`. Writes nothing. |
| POST | `/repos/:id/conventions/skill` | `{name, description, type, enabled, body, replace_skill_id?}` → `Skill`. With `replace_skill_id` set, this is a normal S4 skill update (version+1, existing skill); otherwise it is `SkillsService.create`. |

### Default skill body template

Rendered by `buildConventionsSkillBody` (S3-compatible — the whole thing
becomes a skill's `body`, injected verbatim under `### Skill: <name>`):

```
# <name>
House conventions for `<repo>`. Flag changes that violate any rule below and cite the offending `file:line`.

## <category>: <rule>
Detected in `<path>:<start>-<end>`:
```<lang>
<snippet>
```
```
One `## <category>: <rule>` section per accepted candidate, in list order.

## Module layout (onion, per `arch:check`)

`server/src/modules/conventions/`:

- `routes.ts` — the five endpoints above.
- `service.ts` — orchestration only; talks to ports (repoIntel, git, llm,
  the skills service), never to Drizzle directly.
- `repository.ts` — all Drizzle access for `convention_scans` and
  `conventions`, including the C6 delete-then-reinsert transaction (copy the
  shape of `AgentsRepository.setSkills` — see `server/INSIGHTS.md`, "What
  Works").
- `helpers.ts` — pure functions only, no I/O: sample selection, `verifyEvidence`,
  `normalizeRule`, `buildConventionsSkillBody`, the prompt builder. Declares
  its own local `ConventionRowLike`-style structural interface for row shapes
  instead of importing them from `./repository.js`, to avoid the
  `helpers.ts` ↔ `repository.ts` circular-import trap `arch:check`'s
  `no-circular` rule catches on any NEW module (`server/INSIGHTS.md`,
  2026-09-22).
- `prompt.ts` — the system prompt: asks for 5–15 conventions that recur
  across the sampled files, each citing a real line range, with no generic
  advice.

Register the module with one import + one entry in `modules/index.ts`,
exactly as every other module is registered.
