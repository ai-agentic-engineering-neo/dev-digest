# 03-spec-skills-import-and-test-quality.md

Part 3 of 3. Depends on [01 skills library](../01-spec-skills/01-spec-skills.md) and [02 agent binding](../02-spec-skills-agent-binding/02-spec-skills-agent-binding.md).

## Introduction/Overview

Authors need a safe way to bring in a skill from a markdown file or a skill archive, and a concrete agent that proves reuse. This spec adds confirm-only import (read `SKILL.md`, never run bundled code), seeds the mockup skill catalog onto existing reviewers, and adds **one** new agent — Test Quality Reviewer — with three or four test-quality skills, at least one introduced through import. A fixture PR with happy-path-only tests is the control experiment.

## Goals

- A user can import a `.md` or zip/`.skill` package, preview the extracted core, see a trust warning, and save only after confirm. Bundled scripts are ignored and never executed.
- Test Quality Reviewer exists, with three or four attached skills covering uncovered branches, corner cases, excessive mocking, and (if the fourth is kept) flaky tests.
- At least one of those skills is created via the import preview path, not only SQL seed.
- Existing Security and Performance agents are seeded with the mockup catalog so a manual General + Security run on this feature’s own PR shows both a front-end-oriented and a back-end-oriented skill in the traces.
- Hermetic tests prove prompt inclusion/exclusion; a live LLM run of the fixture PR is a demo proof, not a CI gate.

## User Stories

- **As a reviewer author**, I want to import a skill file, read it, and confirm before it can reach any agent, so a stranger’s markdown cannot silently become production instructions.
- **As a reviewer author**, I want Test Quality Reviewer to flag weak tests (uncovered branches, missing corners, heavy mocking, flakes) so those comments are not buried in a general review.
- **As a demo operator**, I want a fixture PR that is quiet without test-quality skills and noisy with them, so the feature’s value is visible in one comparison.
- **As someone reviewing this change itself**, I want to click Run Review on General and Security (no auto-run) and see both UI-oriented and API-oriented skill blocks in the traces.

## Demoable Units of Work

### Unit 1: Import markdown or archive (preview, then save)

**Purpose:** Extract only the skill core. Treat the file as untrusted until the user confirms. Never execute anything from the archive.

**Functional Requirements:**
- The user shall pick **Add Skill → Import** and upload either a markdown file or a zip/`.skill` archive.
- The system shall parse, **in memory**:
  - Markdown: optional YAML frontmatter `name` / `description`, remainder is `body`. If frontmatter is missing, name may come from the first heading; description stays empty until the user fills the required field.
  - Archive: locate `SKILL.md` (allowed: `SKILL.md` at zip root **or** `skill-name/SKILL.md` as in the [Agent Skills](https://agentskills.io) spec). Read that file only. Do not interpret, write out, or run `scripts/`, `references/`, `assets/`, binaries, or other entries.
- Zip handling shall reject path traversal (zip-slip), enforce a size cap, and never call `exec` / `spawn` / `eval` on contents.
- The UI shall show a preview of name, description, and rendered body **before** persist, plus an explicit trust warning: an imported skill becomes **instructions** in an agent prompt once enabled and attached — not inert data.
- Confirm writes a skill with `enabled = false` and `source` distinguishing file import from manual create. Extend `SkillSource` with `imported` (do not overload `imported_url`). User then enables and attaches (spec 02).
- Cancel / close without confirm persists nothing.
- URL fetch and community catalog are **out of scope**.

**Proof Artifacts:**
- Hermetic tests: fixture `SKILL.md` with frontmatter → preview DTO; zip with `scripts/pwn.sh` + `SKILL.md` → preview equals the markdown core and the test **asserts no subprocess** (spy on `child_process` remains unused); zip-slip path `../etc/passwd` → 400; confirm creates a disabled row; omitting confirm leaves `GET /skills` unchanged.
- Browser: import the repo fixture, read the warning, confirm, see the skill disabled on the list; enable + attach in spec 02’s tab.

---

### Unit 2: Seed catalog + Test Quality Reviewer (3–4 skills)

**Purpose:** Demonstrate reuse on existing agents and ship the one new reviewer the product actually needs.

**Functional Requirements:**
- The system shall seed the **mockup catalog** (idempotent, like existing agents) and attach it as below. Bodies are markdown instructions (no tools). Types match the mockup badges:

  | Name | Type | Security | Performance | Notes |
  |---|---|---|---|---|
  | `pr-quality-rubric` | rubric | enabled | enabled | shared — proves one skill, two agents |
  | `no-then-chains` | convention | enabled | off | front-end / JS-oriented |
  | `secret-leakage-gate` | security | enabled | off | back-end / API-oriented |
  | `lethal-trifecta` | security | enabled | off | |
  | `phantom-api-gate` | security | disabled | off | linked but off, as in the mockup |
  | `test-coverage-nudge` | custom | disabled | off | |

  “Off” means no `agent_skills` row (Performance) or `agent_skills.enabled = false` (Security’s disabled mockup rows). `no-then-chains` is **enabled on Security** even though one mockup screenshot shows it unchecked — that is required so a manual Security run on a full-stack PR still carries a front-end-oriented skill alongside secret/API skills. General Reviewer stays unattached (keeps the “empty vs skills” contrast for the control experiment if needed).
- The system shall seed **Test Quality Reviewer** (same default provider/model as other built-in agents). System prompt: review **test** changes for weakness, not product correctness in general. `ci_fail_on` may stay `critical`. Auto-run is the existing studio behaviour (user clicks Run Review); do not add a new scheduler.
- Test Quality shall be linked to **four** skills, or **three** if product later drops flakes. Default is four, all `custom` (or `rubric` where the body is a scoring rubric):

  | Name | What the body must instruct the model to flag |
  |---|---|
  | `uncovered-branches` | New production branches/paths with no asserting test |
  | `corner-cases` | Missing empty/null/error/boundary cases |
  | `excessive-mocking` | Mocks that replace the unit under test or hide real behaviour |
  | `flaky-tests` | Time, order, or unseeded randomness that will flake |

- **At least one** of those four (recommended: `flaky-tests`) is **not** inserted by `seed.ts`. It ships as a fixture file under `docs/skill-fixtures/` (markdown or zip **without** working scripts, optionally a dummy `scripts/` entry to prove it is ignored). The demo/e2e path imports it through Unit 1, enables it, and attaches it to Test Quality Reviewer.
- Skill descriptions are required, directive, and UI-only (spec 01 / Q7).

**Proof Artifacts:**
- Seed is idempotent: second `pnpm db:seed` does not duplicate skills or agents.
- After seed + import of the fixture: Test Quality has 3 or 4 links; `GET /agents/:id/skills` shows them ordered.
- `pr-quality-rubric` `skill_id` is shared by Security and Performance (one row, two links).

---

### Unit 3: Control experiment + self-review check

**Purpose:** Show that skills change review behaviour, and that traces expose the block.

**Functional Requirements:**
- The system shall seed **one** fixture pull request (or a committed fixture diff used by tests) whose test file covers only the happy path — no error/empty branch assertions. Title/body should make that obvious.
- **Hermetic (CI):** with Test Quality’s skills attached, prompt assembly for that diff includes the enabled skill bodies; with those links disabled, `assembly.skills` is null. This does not call a live LLM.
- **Demo (not CI):** run Test Quality on the fixture PR with skills off (expect a skip / no test-quality findings) then on (expect findings that cite an uncovered branch and a missing corner). Open the run trace → Prompt assembly → skills block + token count.
- **Self-review of this feature’s PR:** there is no new `pr-self-review` agent. The operator clicks Run Review on **General** and/or **Security** (studio has no auto-run). Security’s trace must show both a front-end-oriented skill (`no-then-chains`) and a back-end-oriented skill (`secret-leakage-gate` or `lethal-trifecta`).
- Original brief’s **API Contract** agent and second experiment (breaking route signature) are **out of scope** (chat override: one new agent only).

**Proof Artifacts:**
- Hermetic tests as above.
- Manual demo checklist (Success Metrics). Screenshot or recorded trace is sufficient; do not fail CI on model wording.

## Non-Goals (Out of Scope)

1. **API Contract Reviewer** and its breaking-change experiment.
2. **A third agent named pr-self-review.**
3. **URL / community import**, executing `scripts/`, installing skill dependencies.
4. **Eval dashboard, skill Stats, attaching Project Context files to a skill.**
5. **CI-gating on live LLM findings** (non-deterministic).

## Design Considerations

Import UX: Add Skill dropdown, preview pane, trust warning, confirm. Reuse Skills Lab chrome from spec 01. Do not add Evals/Stats/Context tabs. Test Quality cards should look like other agent cards (name, model chip, skill count).

## Repository Standards

- Import parsing is pure where possible (zip + frontmatter → DTO) so hermetic tests need no Postgres; persist happens in `SkillsService` after confirm.
- Fixture files are committed (markdown/zip), not generated at runtime.
- Seed stays idempotent (`server/src/db/seed.ts` pattern: lookup by workspace + name).
- Shared `SkillSource` enum change is in `server/src/vendor/shared` then mirrored.
- Do not add a second prompt assembler.

## Technical Considerations

Latest standards used:

- **Agent Skills spec** ([agentskills.io](https://agentskills.io), Claude docs, 2026): package = directory with `SKILL.md` (YAML `name` + `description` + markdown body); `scripts/` is optional executable code. This product **only** ingests `SKILL.md`.
- **OWASP A08 / upload checklist:** size + type limits, zip-slip rejection, no execution of uploads.

Implementation notes:

- Prefer reading zip entries into strings with a library already in the server lockfile if one exists; do not add a dependency without checking.
- Imported skills start disabled so confirm ≠ attach. Spec 02’s dual gate keeps them out of prompts until the user enables both flags.
- `reviewer-core` still receives `string[]` bodies. No engine change unless assembly is missing from the persisted success trace (fix that in spec 02 if not already done).

## Security Considerations

- Imported content is attacker-controlled. Preview and store as text. After enable, it **is** prompt injection by design — the warning must say that in plain language.
- Never follow zip symlinks or `..` paths. Never write uploaded archives to the clone directory.
- Do not fetch URLs server-side in this spec (SSRF).
- Markdown preview: existing renderer only.

## Success Metrics

1. Import preview shows `SKILL.md` core; a zip that also contains `scripts/` still imports only the markdown; nothing executable runs (test spy).
2. Test Quality Reviewer exists with 3–4 attached skills, one of them coming through import.
3. `pr-quality-rubric` is reused by Security and Performance.
4. Fixture PR: hermetic prompt test passes; live demo flags uncovered branch + corner when skills are on.
5. Manual Security (or Security + General) run on this feature’s PR shows front-end and back-end skill blocks in traces.
6. Enabled skill → visible skills block; disabled → omitted.

## Open Questions

1. Ship **four** Test Quality skills by default; dropping `flaky-tests` to three is allowed without a new spec if the import fixture is remapped to another of the remaining three.
2. Exact markdown wording of seeded bodies is an implementation detail as long as the table in Unit 2 is honoured.
3. Whether General Reviewer should also get `no-then-chains` (redundant with Security) — default **no**, to keep one agent clearly “catalog-empty”.
