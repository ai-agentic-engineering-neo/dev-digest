# 05-validation-api-contract-reviewer.md

## Executive Summary
- **Overall:** PASS (gates A–F clear; no CRITICAL/HIGH)
- **Implementation Ready:** Yes — Units 1–3 are seeded, imported, and proven hermetically; live traces show skills-off omits the SKILLS block and skills-on injects it. Leftover risk is demo polish (list card has no “3 skills” badge; skills-off live run still flagged the rename), not missing required behaviour.
- **Key metrics:** 15/15 Functional Requirements Verified (100%) · 19/19 listed Proof Artifacts accessible (100%) · Core files in commits `2734d50` / `368ce43` / `fd56e4d` map to Relevant Files

Auto-discovery: highest `docs/specs/` sequence with a task list is **05**; all parent tasks are `[x]`; most recent git activity on this folder is `fd56e4d` (2026-09-19). Spec 04 is complete and out of this validation’s scope.

## Coverage Matrix

### Functional Requirements
| Requirement ID/Name | Status | Evidence |
|---------------------|--------|----------|
| U1-FR1 Idempotent seed of API Contract Reviewer; `DEFAULT_PROVIDER` / `DEFAULT_MODEL`; `ci_fail_on` default `critical`; no scheduler | Verified | `seed.ts` lookup by workspace+name, `ciFailOn` unset; live `GET /agents` one row `openrouter` / `deepseek/deepseek-v4-flash` / `ci_fail_on=critical`; it-test after two `seed()`; commit `2734d50` |
| U1-FR2 System prompt in `seed-prompts.ts` + `docs/agent-prompts/api-contract-reviewer.md`, linked from README; public-HTTP scope; severity/verdict/findings; no JSON shape | Verified | README lists the file; prompt has CRITICAL/WARNING/SUGGESTION, `request_changes`, `No findings ⇒ approve`; hermetic `seed-skills.test.ts` forbids `json_schema` / `{ verdict`; semantic match with TS template (backtick escapes only) |
| U1-FR3 Three `custom` skills via `upsertSkill` → `SkillsRepository.insert`; bodies directive + Good/Bad per table; **no** `deprecation-policy` | Verified | `seed-skills.ts` `API_CONTRACT_SKILLS` three names; comment + catalog omit `deprecation-policy`; `seed-skills.test.ts` 5/5; it-test unique names and absence |
| U1-FR4 `GET /agents/:id/skills` is the three enabled links in order; not attached to General / Security / Performance / Test Quality | Verified | it-test matrix copies spec 03 expects plus API Contract `['breaking-change','response-schema','semver-discipline']` all `custom` enabled |
| U1-FR5 Second `pnpm db:seed` does not duplicate agent or skill names | Verified | `skills-seed.it.test.ts` `beforeAll` calls `seed()` twice; uniqueness asserts |
| U2-FR1 Committed `docs/skill-fixtures/deprecation-policy/SKILL.md` YAML name/description + Good/Bad (keep `userId` / don’t silent-delete) | Verified | File content; commit `368ce43` |
| U2-FR2 Import via existing preview → confirm (`enabled: false`, `source: imported`) → enable → `POST /agents/:id/skills` full ordered set (append, keep first three `skill_id`s) | Verified | it-test preview length unchanged; confirm 201 flags; POST `[...existing, new]`; first three ids snapshot-equal |
| U2-FR3 After attach, four ordered names ending `deprecation-policy`; dual-gate unchanged (no second assembler) | Verified | it-test names; live `GET /agents/:id/skills` four enabled; Skills tab screenshot `4 of 15 enabled` |
| U2-FR4 Reuse spec 03 import routes/UI; no second parser/multipart/URL fetch; Create Agent not required | Verified | Spec 05 commits add no `routes.ts` / import parser files; demo used existing modal |
| U3-FR1 Committed `breaking-response-rename.diff`: `src/api/public/` `userId` → `user_id`, no alias / `deprecated` / `/v2/` | Verified | Diff file; `filesFromUnifiedDiff` in seed |
| U3-FR2 Seed PR **#902** on `acme/payments-api` (repo+number), non-null `pr_files.patch`, idempotent | Verified | `seed.ts` three-hop URL `../../../docs/skill-fixtures/breaking-response-rename.diff`; it-test; live `GET` title/body/patch |
| U3-FR3 Hermetic `assemblePrompt` + exported `API_CONTRACT_SKILL_BODIES` → skills + `## Skills / rules`; `skillsPromptArg([])` → `assembly.skills === null`; no second assembler / no `reviewer-core` change | Verified | `prompt-structured.test.ts` 9/9; `git diff 2734d50^..fd56e4d -- reviewer-core` empty; imports `seed-skills.ts` constants |
| U3-FR4 Demo: API Contract only; skills-off trace has no SKILLS block; skills-on has block + non-zero tokens; live wording not a CI gate | Verified | `05-trace-skills-off.png` SYSTEM+USER, tokens `2k→0.9k`; `05-trace-skills-on.png` SKILLS ~341 tok, stats `3k→0.9k`; checklist records off-run still flagged rename |
| U3-FR5 No live-LLM e2e job; `e2e/specs/03-agents.flow.json` still waits for “Security Reviewer” | Verified | No e2e file in spec 05 commits; flow.json still contains `Security Reviewer` |
| NG Non-goals: no conventions/oasdiff/new routes/migrations/`pr-self-review`/CI-on-wording | Verified | Empty diff on `reviewer-core/**`, `server/src/modules/conventions/**`, `server/src/db/migrations/**`, `src/vendor/**`, lockfiles |

### Repository Standards
| Standard Area | Status | Evidence & Notes |
|---------------|--------|-----------------|
| Coding Standards | Verified | Seed-only catalog change; `upsertSkill` uses `SkillsRepository.insert`; REST snake_case; no new module slice |
| Testing Patterns | Verified | Hermetic `seed-skills.test.ts` beside source; Postgres `server/test/skills-seed.it.test.ts`; prompt case in existing `prompt-structured.test.ts` |
| Quality Gates | Verified | Re-run 2026-09-19: hermetic 26 files / 193 tests; `skills-seed.it.test.ts` 6/6; `pnpm typecheck`; `pnpm lint` |
| Vendor / migrations / lockfiles | Verified | 17 `*.sql` files unchanged; no vendor or lockfile edits in spec 05 commits |
| Prompt originals | Verified | `docs/agent-prompts/README.md` links `api-contract-reviewer.md`. Body matches `API_CONTRACT_REVIEWER_PROMPT` aside from TS backtick escapes |
| Fixture URL hops | Verified | `server/src/db/seed.ts` three hops; tests two hops (`../../docs/...`) |
| Commits | Verified | `feat:` prefixes; `Related to T1.0 / T2.0 / T3.0 in Spec 05` |
| Dual-gate | Verified (reused) | No second `assemblePrompt`; `skillsPromptArg` reused. Executor filter not re-tested on this agent (planning audit FLAG; spec 02 owns it) |

### Proof Artifacts
| Unit/Task | Proof Artifact | Status | Verification Result |
|-----------|----------------|--------|---------------------|
| 1.0 | `cd server && pnpm exec vitest run test/skills-seed.it.test.ts` | Verified | 6 passed (re-run); covers unique agent, three skills, no seed `deprecation-policy`, spec 03 matrices |
| 1.0 | `cd server && pnpm exec vitest run src/db/seed-skills.test.ts` | Verified | 5 passed |
| 1.0 | URL `http://localhost:3000/agents` | Verified | HTML 200; card visible in `05-agent-card.png` |
| 1.0 | Screenshot `05-proofs/05-agent-card.png` | Verified | Name + `deepseek/deepseek-v4-flash`; **no** skill-count badge (list does not pass `skillCount`) |
| 1.0 | `cd server && pnpm typecheck`; migrations unchanged | Verified | `tsc --noEmit` exit 0; 17 SQL files |
| 1.0 | `05-proofs/05-task-1-proofs.md` | Verified | Front-loads context; embeds screenshot with path above image; no credentials |
| 2.0 | it-test import + attach `deprecation-policy` | Verified | Same `skills-seed.it.test.ts` file, 6/6 including preview/confirm/order/`skill_id` snapshot |
| 2.0 | URL `/skills` then `/agents/<id>?tab=skills` | Verified | Studio 200; live links four names all enabled |
| 2.0 | Screenshot `05-proofs/05-skills-tab.png` | Verified | Four checked rows: breaking-change → response-schema → semver-discipline → deprecation-policy |
| 2.0 | `05-proofs/05-task-2-proofs.md` | Verified | Front-loads context; inline screenshot; no credentials |
| 3.0 | `cd server && pnpm exec vitest run test/prompt-structured.test.ts` | Verified | 9 passed (includes #902 on/off) |
| 3.0 | it-test PR #902 patch | Verified | Title/body `/rename\|breaking/i`; patch has `userId` + `user_id`, not `deprecated` |
| 3.0 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | Verified | 26 files, 193 tests |
| 3.0 | URL `/repos/<id>/pulls/902` | Verified | HTML 200; API detail body + patch |
| 3.0 | `05-proofs/05-fixture-pr-902.png` | Verified | Title/body state breaking rename, no deprecation, no major |
| 3.0 | `05-proofs/05-trace-skills-off.png` | Verified | Prompt assembly SYSTEM + USER, no SKILLS; tokens `2k→0.9k` |
| 3.0 | `05-proofs/05-trace-skills-on.png` | Verified | SKILLS block (~341 tokens) + stats `3k→0.9k`; finding may cite rename (not a CI gate) |
| 3.0 | `05-proofs/05-task-3-proofs.md` | Verified | Checklist + inline screenshots; records off-run still flagged rename; no live keys |
| 3.0 | `e2e/specs/03-agents.flow.json` | Verified | Still waits for “Security Reviewer”; spec 05 commits do not touch `e2e/` |

## Validation Issues

| Severity | Issue | Impact | Recommendation |
|----------|-------|--------|----------------|
| MEDIUM | Spec Unit 1 proof text asks for AgentCard skill count **3**. `AgentsListView` does not pass `skillCount`, so `05-agent-card.png` shows name + model only. Task 1.6 and `05-task-1-proofs.md` already document this as optional. Count is proven by `GET /agents/:id/skills`. | Weaker visual audit of “3 skills” on `/agents`. | Optional: pass `skillCount` from the list hook, or drop that clause from the spec proof line. |
| MEDIUM | Success metric 5 wanted skills-off to miss the rename. The off-run still emitted CRITICAL (honestly recorded in `05-task-3-proofs.md`). Unit 3 FR allows miss and forbids CI-gating on wording. | Demo “quiet vs noisy” is weaker; required proof is the SKILLS block on/off, which holds. | Leave as demo note. Do not add a live-LLM CI job. |
| MEDIUM | Dual-gate (`skills.enabled && agent_skills.enabled`) is not re-proven on this agent (planning audit FLAG). 3.3 passes raw bodies into `assemblePrompt`. | A regression in `ReviewRunExecutor`’s filter could still pass spec 05 tests. | Rely on spec 02 executor tests; do not add a second assembler. |
| MEDIUM | `docs/agent-prompts/api-contract-reviewer.md` is not byte-identical to the TS template (markdown backticks vs escaped template literals). | No wording drift; other seeded prompts use the same escape pattern. | Optional: a hermetic equality test that normalizes escapes. |
| MEDIUM | Supporting file `server/INSIGHTS.md` is not in the Relevant Files table (D3). Spec 05 commit `fd56e4d` adds a secrets-status vs `.env` note. | Traceability nit; clearly linked to live-demo ops, not runtime behaviour. | Optional row in Relevant Files. |

No CRITICAL or HIGH issues. No unmapped core files (D1). Gate F: proof markdown mentions `OPENROUTER_API_KEY` as empty / status booleans only; screenshots show cost `$0.00013`–`$0.00019`, no tokens/keys.

## Evidence Appendix

### Git commits analyzed (spec 05 implementation)
| Commit | Message | Maps to |
|--------|---------|---------|
| `2734d50` | `feat: seed API Contract Reviewer with three contract skills` · Related to T1.0 in Spec 05 | Unit 1 |
| `368ce43` | `feat: import deprecation-policy and bind it to API Contract Reviewer` · Related to T2.0 in Spec 05 | Unit 2 |
| `fd56e4d` | `feat: seed PR 902 and prove API Contract skills on/off assembly` · Related to T3.0 in Spec 05 | Unit 3 |

Core files in those commits: `server/src/db/seed.ts`, `seed-prompts.ts`, `seed-skills.ts`. Supporting: hermetic + it-tests, fixtures, agent-prompt original, proofs/screenshots, task/spec/audit/questions, `server/INSIGHTS.md`.

Out-of-scope empty: `reviewer-core/**`, `server/src/modules/conventions/**`, `server/src/db/migrations/**`, `src/vendor/**`, lockfiles.

### Commands executed this validation
```
cd server && pnpm exec vitest run src/db/seed-skills.test.ts test/prompt-structured.test.ts
# ✓ 14 tests

cd server && pnpm exec vitest run test/skills-seed.it.test.ts
# ✓ 6 tests

cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
# ✓ 26 files, 193 tests

cd server && pnpm typecheck && pnpm lint
# tsc --noEmit exit 0; eslint .

ls server/src/db/migrations/*.sql | wc -l
# 17

curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/agents
# 200
curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/repos/7a3b3ddc-f480-46d8-9882-52fc326b3a2b/pulls/902
# 200
curl -sS http://localhost:3001/agents
# one API Contract Reviewer, ci_fail_on=critical, openrouter/deepseek/deepseek-v4-flash
curl -sS http://localhost:3001/agents/<id>/skills
# breaking-change, response-schema, semver-discipline, deprecation-policy (all enabled) — live DB after Unit 2 import
curl -sS http://localhost:3001/pulls/7f0d8da3-e8d4-4bf4-835a-fdcd52a0df3f
# body mentions breaking rename; patch has userId + user_id, not deprecated

git diff --name-only 2734d50^..fd56e4d -- reviewer-core server/src/modules/conventions server/src/db/migrations
# (empty)
```

Live catalog after Unit 2 import **does** contain `deprecation-policy` (expected). Seed-without-import absence is the it-test workspace (two `seed()` calls, no import until that case).

---
**Validation Completed:** 2026-09-19 14:18 EEST
