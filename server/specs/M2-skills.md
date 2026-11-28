# M2 · Skills for review agents (server)

Client side: `client/specs/M2-skills.md`.

## Goal
Reusable, text-only review rules ("skills") that any agent can use. A skill is a
named markdown block; an agent links skills, enables/disables each one, and orders
them. Enabled skills are appended to the agent's **system** prompt in that order.
A skill never executes anything — only its text reaches the model.

## User-visible behaviour
- CRUD over skills (DB is the source of truth). Editing the body creates a new
  version with an optional change note; restoring an old version creates a NEW
  version with that body (history is never rewritten).
- Preview returns the exact block the agent receives (`### Skill: <name>` + body)
  and its token count — rendered by `renderSkillBlock` from reviewer-core, the same
  function the engine uses.
- Import is two-step: `POST /skills/import/preview` parses a `.md` or `.zip` and
  persists nothing; `POST /skills/import` saves only with `trusted: true`
  (`source='imported_file'`). From a zip only `SKILL.md` (root or one folder deep)
  is decompressed; every other entry is listed in `skipped_files`, never read or run.
- Agent links: `PUT /agents/:id/skills` replaces the full ordered list
  `[{skill_id, enabled}]` in one transaction; foreign-workspace or unknown ids → 422.
  A change in the enabled set/order bumps the agent version (snapshot).
- A run includes a skill only when it is linked, enabled for the agent AND globally
  enabled. The run log gets `Skills: N enabled (+T tokens): a, b`; the trace gets
  `prompt_assembly.skill_blocks` (name, source, version, tokens) + `skills_tokens`;
  `agent_run_skills` records skill + version per run.
- Stats (30 days): used-by agents, pull frequency (runs of the linked agents whose
  prompt carried the skill), findings from those runs by category, accept rate =
  accepted / (accepted + dismissed). Correlated, not causal.

## API
| Method | Path | |
|---|---|---|
| GET/POST | `/skills` | list (+card stats) / create v1 |
| GET/PUT/DELETE | `/skills/:id` | read / edit (body → new version) / delete |
| GET | `/skills/:id/preview` | `{block, tokens}` |
| GET | `/skills/:id/stats` | `SkillStats` |
| GET | `/skills/:id/versions[/:version]` | history / one version with body |
| POST | `/skills/:id/versions/:version/restore` | new version from vK |
| POST | `/skills/import/preview` | `{file_name, content_base64}` → `SkillImportPreview` |
| POST | `/skills/import` | `ConfirmSkillImportInput` (`trusted: true`) |
| GET/PUT | `/agents/:id/skills` | `AgentSkillView[]` / `SetAgentSkillsInput` (old POST removed) |

Upload is base64 JSON (not multipart) so the body is validated by the route's zod
schema like every other route; route `bodyLimit` ≈ 6.8 MB (5 MB zip).

## Contract & data changes
- Migration `0012`: `agent_skills.enabled`, `skills.updated_at`, unique
  `(workspace_id, name)`, `skill_versions.change_note`, new `agent_run_skills`.
- `SkillSource` + `imported_file`; `Skill.stats`/`updated_at`; `Agent.skill_count`;
  new `CreateSkillInput`, `UpdateSkillInput`, `SkillVersion`, `SkillPreviewBlock`,
  `SkillStats`, `SkillImportPreview`, `ConfirmSkillImportInput`, `AgentSkillView`,
  `SetAgentSkillsInput`; `PromptAssembly.skill_blocks` / `skills_tokens` (nullish).
- reviewer-core: `PromptParts.skills` / `ReviewInput.skills` are `{name, body}[]`;
  skills moved from the user message (`## Skills / rules`) to the system message,
  before the injection guard (which stays last). Not `<untrusted>`-wrapped: the
  guard would make the model ignore them; trust is the importing human's decision.
- New adapter `src/adapters/archive` (fflate, read-only, in-memory; limits: 200
  entries, 256 KB per file, ratio 100, unsafe paths refused) + `MockArchiveReader`.
- Run executor now persists the trace (and `agent_run_skills`) BEFORE flipping the
  run to `done`, so status watchers never read a stub trace.

## Seed
- Agent **Test Quality Reviewer** (`docs/agent-prompts/test-quality-reviewer.md`).
- Skills `untested-branches`, `edge-case-checklist`, `over-mocking-gate` → Test
  Quality; `api-contract-breaking-change` → General Reviewer. Links are seeded only
  for agents with no links (never overrides a user's setup).
- `docs/skills-examples/flaky-test-smells.zip` (SKILL.md + `scripts/install.sh`) to
  exercise import.
- Control PRs on `acme/payments-api` (diff from `pr_files.patch`, no GitHub needed):
  #483 refund logic + happy-path-only test; #484 payments route "cleanup" that
  renames `amount` → `amount_cents` in the response and the capture body.

## Control experiment (needs an LLM key)
1. PR #483 with Test Quality Reviewer: untick all its skills → run → expect the
   untested branches to be missed; tick them back → run → expect findings on the
   `amountCents > refundable` branch / disputed branch and the `== refundable` edge.
2. PR #484 with General Reviewer: without vs with `api-contract-breaking-change` →
   expect the breaking `amount` → `amount_cents` change to be flagged only with it.
3. Run Trace → Prompt assembly: the "Skills — appended to system (+T tok)" block and
   the per-skill list; a disabled skill is absent from both.
LLM output is not deterministic — the experiment shows the tendency, not a test.

## Out of scope
Evals tab / "Run on evals" (M6), import from URL / community catalog, extracted
(convention) skills, per-finding skill attribution.

## Acceptance
- [x] CRUD, versions, restore, preview, import (preview persists nothing, trust required) — `test/skills.it.test.ts`
- [x] Links: order, per-agent enabled, cross-workspace refusal, version bump — `test/skills.it.test.ts`
- [x] Only enabled skills reach the system prompt; trace + `agent_run_skills` + stats — `test/skills.it.test.ts`
- [x] Archive safety (zip-slip, bombs, scripts never read) + parser — `test/skills-import.test.ts`
- [x] Prompt order / guard last — `reviewer-core/test/prompt.test.ts`
- [x] Seed fixture diffs parse and are groundable — `test/seed-fixtures.test.ts`
