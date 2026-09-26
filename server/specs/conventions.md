# Conventions Extractor (HW2) — server

Extract house coding conventions from a cloned repository, verify each
candidate against the files, let the user accept / reject / edit them, and
turn the accepted ones into the `repo-conventions` skill linked to an agent.
The UI half lives in [`client/specs/conventions.md`](../../client/specs/conventions.md).

Status: **implemented 2026-09-26** (module `modules/conventions/`, migration
`0011_hw2_conventions_scans`, tests). Written 2026-09-26.

## Data model

| Table | Role |
|---|---|
| `convention_scans` (new) | one row per extraction run: `status` running/done/failed, `provider`, `model`, `sample_count`, `candidates_found`, `candidates_kept`, `error`, `started_at`, `finished_at` |
| indexes (migration `0012`) | `convention_scans(workspace_id, repo_id, started_at)`, partial unique `convention_scans(repo_id) WHERE status = 'running'`, `conventions(workspace_id, repo_id)`, `conventions(scan_id)`, and `skills(workspace_id, name)` unique (23505 → 409 in the skills repository) |
| `conventions` (extended) | a verified candidate: `category`, `rule`, `evidence_path`, `evidence_line`, `evidence_snippet`, `confidence`, `status` candidate/accepted/rejected, `scan_id`, timestamps. The starter's `accepted` boolean is kept in sync (`status === 'accepted'`) because dropping it makes `drizzle-kit generate` ask an interactive rename question |

## API (`modules/conventions/routes.ts`)

| Route | Result |
|---|---|
| `GET /repos/:id/conventions` | `ConventionsView { scan, candidates }`, latest scan or `null`; candidates ordered by confidence |
| `POST /repos/:id/conventions/extract` | 202 `{ scan }` (status `running`); 404 unknown repo; 422 when the repo has no clone; a running scan younger than 10 min is returned as is, an older one is marked failed (orphaned) and a new one starts; a partial unique index (`one running per repo`) turns a concurrent start into the existing scan |
| `PUT /conventions/:id` | `{ status?, rule?, category? }` → the candidate (accept / reject / edit inline) |
| `POST /repos/:id/conventions/deselect` | every accepted row back to candidate; `{ updated }` |
| `GET /repos/:id/conventions/skill-draft` | `ConventionSkillDraft` built from the accepted rows (422 when none), with `existing_skill_id` when a skill of that name exists |
| `POST /repos/:id/conventions/skill` | `{ name, description, type, body, enabled?, agent_id }` → 201 `{ skill, updated_existing }`; creates the skill with `source: 'extracted'` or writes a new version of the existing one, then links it to the agent (appended to its list, bumps the agent version) |

## Extraction run (`ConventionsService.runExtraction`, a JobRunner job)

1. **Sample selection, in code, no model** (`collectSamples`): the config
   files that exist (`eslint.config.*`, `.eslintrc*`, `tsconfig.json`,
   `.prettierrc*`, `prettier.config.*`, `.editorconfig`, `biome.json`) at the
   root and in each sampled top-level folder, plus the top-12 ranked source
   files from `repoIntel.getConventionSamples(repoId, 12)`. Files are read
   through the git adapter (`container.git.readFile`), capped at 6 000 chars
   each and 60 000 in total.
2. **One structured LLM call** on the workspace's `conventions` feature model
   (Settings → Models; default from the registry). Samples go in
   `<untrusted source="path">` blocks. The response is the `ConventionExtraction`
   contract: `{ candidates: [{ category, rule, evidence_path, evidence_line,
   evidence_snippet, confidence }] }`.
3. **Evidence verification** (`verifyEvidence`): the file must be one we read,
   the line must exist, and the snippet's first line must occur within ±2
   lines of the claimed line (the line is corrected to where it was found).
   Candidates below confidence 0.3 or without evidence are dropped.
4. **Persistence** (`replaceCandidates`): rows that are not `rejected` are
   replaced by the survivors; a rule that was rejected earlier (matched by
   normalised text) stays rejected and is not re-inserted. The scan row records
   the counts, or the error when anything above throws.

## The `repo-conventions` skill

`buildSkillDraft` renders one `## <slug>` section per accepted candidate with
the rule and a fenced `Detected in path:line` snippet under a directive header.
Default name `repo-conventions`, type `convention`; the modal may change every
field. Saving an existing name appends a version instead of returning 409.

## Composition

The service depends only on ports (`ports.ts`). `routes.ts` builds them from
the container: `conventionsRepo`, `reposRepo`, `repoIntel`, `git`, `llm`,
`featureModel`, `jobs`, and the sibling services `skillsService` /
`agentsService` that the container now exposes (onion rule 6: modules never
import each other). Skill name/body limits shared with the skills module live
in `modules/_shared/skill-limits.ts`.

## Tests

| File | Covers |
|---|---|
| `test/conventions-helpers.test.ts` | config sampling, truncation, evidence verification (kept, corrected, dropped), prompt wrapping, rule keys, draft body |
| `test/conventions.it.test.ts` | extract through the real JobRunner with mocked git / repo-intel / LLM: samples in code, hallucinated candidate dropped, persistence; accept / reject / edit; rejected survives a re-scan; draft; create + update-as-new-version + agent link; deselect; failed model call recorded on the scan |
