# Conventions Extractor — server

Client half: [../../client/specs/conventions.md](../../client/specs/conventions.md).

## Goal

Surface a repo's house rules, each backed by evidence that code has verified, so the user can
accept, reject or edit them. The accepted rules are merged into one `<repo>-conventions` skill and
optionally linked to an agent.

## Scope

### Data: `conventions` table (migrations `0011`, `0012`)
- `category`, `line_start`, `line_end`, and `status` (`pending` | `accepted` | `rejected`, default
  `pending`) replace the boolean `accepted`. `0011` backfills `status = 'accepted'` from the old
  flag; `0012` drops the flag.
- `created_at`.
- Workspace-scoped (`workspace_id`) and repo-scoped (`repo_id`, cascade).

### Module `src/modules/conventions/`
- `domain.ts` (pure):
  - `locateSnippet`, `groundCandidate`, `dedupeConventions`, `buildConventionsSkillDraft`;
  - `isSafeRelativePath`;
  - `CONFIG_FILE_NAMES`.
- `prompt.ts`: the `ConventionExtraction` Zod schema and the system prompt. Repo files are wrapped
  in `<untrusted source="repository">`.
- `service.ts`, the pipeline:
  1. **Sampling, code only.** Config files (tsconfig / eslint / prettier / editorconfig / biome)
     are taken from the repo root and from the top-level folder of every sampled file. Source files
     are the top 12 from `repoIntel.getConventionSamples()`.
     - Each file is capped: 12k characters for source, 4k for configs. The total is capped at 90k.
     - Binary and unsafe paths are skipped.
     - If repo-intel fails, the config files are still sampled.
  2. **One model call.** The provider and model come from the workspace `feature_models.conventions`
     setting, otherwise from the `FEATURE_MODELS` default (`openai / gpt-4.1-mini`). The call uses
     `temperature: 0` and `maxTokens: 4000`.
     - Without the token cap, the adapter reserves 65k tokens, and OpenRouter returns 402 on keys
       with a low credit limit.
     - The model returns at most 15 candidates.
  3. **Grounding, code only.**
     - The evidence path is normalized and must be safe.
     - The file must exist: either it was sampled, or it is read from the clone.
     - The snippet must contain at least 12 non-whitespace characters and must appear in the file
       line by line, in order. Indentation, inner whitespace and blank lines are ignored.
     - `line_start` / `line_end` and the stored snippet come from the **real file**, not from the
       model.
     - Candidates that fail are dropped and counted in `rejected_ungrounded`.
  4. **De-duplication.** Rule text is compared case- and punctuation-insensitively, against the
     other new candidates and against rules already accepted.
  5. **Store.** In one transaction, every candidate of the repo that is not `accepted` is deleted
     and the new ones are inserted as `pending`. Re-scans keep accepted rules.
- Skill from conventions:
  - `skillDraft` merges the accepted rules into a `# <repo>-conventions` body, with one section per
    rule, the evidence `path:lines`, and a fenced snippet. The fence is longer than any fence inside
    the snippet.
  - `createSkill` validates the name (kebab-case, same rule as the skills module, in
    `modules/_shared/skill-name.ts`), the body (non-empty, at most 50k characters), a unique name
    (409) and the agent (404).
  - It inserts the skill through `container.skillsRepo` with `source: 'extracted'`, which is trusted
    in the prompt, and with `evidence_files`.
  - If an agent was chosen, the skill is appended last to that agent's links through
    `container.agentsRepo`.
- Wiring: `container.conventionsRepo` (port `ConventionsRepositoryPort`, overridable in tests);
  registered as `conventions` in `modules/index.ts`.

### Routes
| Method | Path | Result |
| --- | --- | --- |
| GET | `/repos/:id/conventions` | `ConventionCandidate[]`, sorted by confidence (highest first) |
| POST | `/repos/:id/conventions/extract` | `ConventionExtractResult` `{ candidates, sampled_files, rejected_ungrounded }` |
| POST | `/repos/:id/conventions/status` | set every candidate's status (`{ status }`) → list |
| PATCH | `/conventions/:id` | `{ status?, rule? }` → candidate |
| GET | `/repos/:id/conventions/skill-draft` | `{ name, description, type, body, evidence_files, convention_ids }` |
| POST | `/repos/:id/conventions/skill` | `{ name, description, type, body, enabled?, agent_id? }` → 201 `{ skill, linked_agent_id }` |

Errors:
- 404: the repo or convention is not in the workspace, or the agent is unknown.
- 422:
  - the repo is not cloned;
  - there is nothing to sample;
  - no convention is accepted;
  - the name is not kebab-case, or the rule text is empty.
- 409: a skill with that name already exists.

### Contracts
Module-local (`vendor/shared` is "Do not touch"): `Convention`, `ConventionStatus`,
`ConventionExtractResult`, `ConventionsSkillDraft` in `domain.ts`; the client mirrors them in
`src/lib/types.ts`. The default model `openai / gpt-4.1-mini` is the module's own
(`DEFAULT_CONVENTIONS_MODEL`), mirrored in `client/src/lib/feature-models.ts`; the shared
`FEATURE_MODELS` registry entry is untouched.

### Safety
- `isSafeRelativePath` also refuses any `.git` segment (remote config may carry a token).
- `SimpleGitClient.readFile` resolves the **real** path and refuses anything outside the clone **or under
  `.git/`**, so a repo-shipped symlink (`tsconfig.json -> ../../../.env` or `-> .git/config`) cannot leak
  files to the model.
- Repo text goes through reviewer-core `wrapUntrusted()`; `<file>` delimiters inside it are neutralized
  and quotes in paths escaped, so a file can't close the wrapper or fake another file.
- `conventions_status_check` (migration `0014`) enforces the status enum in the DB.
- Saving the skill and linking it to the agent happen in **one transaction**
  (`skillsRepo.insert({ linkAgentId })`), so a failed link leaves no orphan skill.

## Acceptance criteria
1. Grounding keeps only real evidence:
   - the snippet is matched in the file and its lines are computed;
   - an invented snippet, a missing file, a trivial snippet or a `..` path is dropped;
   - CRLF files work;
   - tests: `test/conventions-domain.test.ts`.
2. Extraction:
   - samples configs and the top files;
   - makes exactly one model call with the default model, or the workspace override when set;
   - sets `maxTokens`;
   - re-scans keep accepted rules and don't duplicate them;
   - tests: `test/conventions-service.test.ts`.
3. End to end over Postgres:
   - extract → accept + edit → draft → create an `extracted` skill linked to an agent → the link
     appears on `/agents/:id/skills`;
   - 404 for an unknown repo or convention, 422 for an id that is not a uuid;
   - tests: `test/conventions-routes.it.test.ts`.
4. `node scripts/check-architecture.mjs` reports no new layer violations. The module imports nothing
   from other modules; it goes through container getters and `_shared`.

## API Contract Reviewer skills (same delivery)
- Seeded and linked in this order: `breaking-change`, `response-schema`, `semver-discipline`. Each
  has a directive description and a good/bad example.
- `deprecation-policy` is the import sample in `docs/skill-samples/deprecation-policy/`.
- The previous seed skills `route-breaking-changes` and `zod-contract-drift` are **retired**:
  `RETIRED_SEED_SKILLS` deletes them on re-seed while they are still unedited (source `manual`,
  version 1). A skill the user edited is kept.
- Experiment: `docs/experiments/README.md` and `api-contract-breaking-change.patch`.
