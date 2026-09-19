# 02-validation-skills-agent-binding.md

## Executive Summary
- **Overall:** PASS (gates A–F clear; no CRITICAL/HIGH)
- **Implementation Ready:** Yes — units 1–3 are implemented, proofed, and independently re-run; leftover risk is residual CI gaps already flagged in the planning audit, not missing behaviour.
- **Key metrics:** 18/18 Functional Requirements Verified (100%) · 15/15 listed Proof Artifacts accessible (100%) · Core files in commits `4aefa70` / `2e2143e` / `9fc6815` map to Relevant Files or named tasks

## Coverage Matrix

### Functional Requirements
| Requirement ID/Name | Status | Evidence |
|---------------------|--------|----------|
| U1-FR1 Additive `agent_skills.enabled boolean not null default true` | Verified | `0015_handy_vision.sql` is a single `ALTER TABLE … ADD COLUMN`; `0000`–`0014` untouched in `4aefa70`; schema `server/src/db/schema/agents.ts` |
| U1-FR2 `AgentSkillLink.enabled` required in shared contract + client mirror | Verified | `server/src/vendor/shared/contracts/knowledge.ts` + client mirror; `test/contracts.test.ts` 9/9 (re-run 2026-09-19) |
| U1-FR3 `GET /agents/:id/skills` summary fields, ordered by `order` | Verified | `toAgentSkillLink` omits `body`; `agent-skills.it.test.ts` 3/3 (re-run, Docker) |
| U1-FR4 `POST { skills: [{ skill_id, enabled }] }` replaces links in order | Verified | Routes prefer `body.skills`; it.test middle-disabled keeps row + order |
| U1-FR5 Globally disabled skill remains listable; does not inject (Unit 3) | Verified | it.test `skill_enabled: false` stays in GET; `enabledSkillBodies` drops global-off; live run `7bcc03a9` |
| U1-FR6 Uncheck sets link `enabled: false` and keeps the row | Verified | it.test uncheck-keeps-row; SkillsTab `toggleRow` keeps `linked: true` |
| U1-FR7 Foreign-workspace `skill_id` rejected | Verified | it.test → 422; `assertSkillsInWorkspace` in repository |
| U2-FR1 Skills tab beside Config; no Context / Evals / Stats / CI | Verified | `VALID_TABS = ["config", "skills"]`; `TABS` two keys; `AgentEditor.test.tsx` 2/2 |
| U2-FR2 Catalog rows: handle, checkbox, name, type badge, order-matters copy | Verified | `SkillsTab.tsx`; screenshots `02-skills-tab-*.png`; `SkillsTab.test.tsx` 3/3 |
| U2-FR3 “N of M enabled” = both global and per-agent | Verified | `enabledCount`; helpers.test 5/5; screenshot dual-gate stays “2 of 3” with global-off checked |
| U2-FR4 Name filter; DnD writes `POST /agents/:id/skills` | Verified | `filterSkillRows` name-only test; `applyDrop` helpers; browser reorder screenshot + GET order after reload |
| U2-FR5 Globally disabled visible; checkbox does not increment N | Verified | `s.row(!row.skill_enabled)`; screenshot `02-skills-tab-dual-gate.png` |
| U2-FR6 Hooks in `lib/hooks/`; thin page; colocated `SkillsTab/` | Verified | `useAgentSkills` / `useSetAgentSkills` in `agents.ts`; no `fetch(` in SkillsTab; folder matches colocation |
| U3-FR1 Dual-gate filter, bodies only, sorted by `order` | Verified | `enabledSkillBodies` 4/4; executor `linkedSkills` → helper → `skillsPromptArg`; live run order swap `279fa2b5` |
| U3-FR2 Success path persists `outcome.assembly` (not `traceFromBuffer`) | Verified | `run-executor.ts` success: `prompt_assembly: outcome.assembly`; `traceFromBuffer` only on failure/cancel |
| U3-FR3 Empty filter omits `skills`; UI skips null block | Verified | `skillsPromptArg([])` = `{}`; `prompt-structured.test.ts` 7/7; `RunTraceDrawer.test.tsx` null case; screenshot `03-trace-skills-omitted.png` |
| U3-FR4 Non-empty skills block + display-only `ceil(chars/4)` token figure | Verified | `approxTokens` in drawer helpers; tokens prop only on skills `PromptBlock`; RTL `~3 tok`; live `~25 tok` vs billing `2k→0.4k` |
| U3-FR5 Skill bodies are instructions, not `<untrusted>` | Verified | `prompt-structured.test.ts` skills section has no `<untrusted>`; `INJECTION_GUARD` text unchanged |

### Repository Standards
| Standard Area | Status | Evidence & Notes |
|---------------|--------|-----------------|
| Coding Standards | Verified | Agents slice `routes → service → repository`; REST snake_case; Zod schema+type same name; SkillsTab colocated; dual-gate in application helpers, not reviewer-core DB |
| Testing Patterns | Verified | Hermetic beside source (`helpers.test.ts`, `SkillsTab.test.tsx`, `reviews/helpers.test.ts`); Postgres `agent-skills.it.test.ts`; client mocks hooks |
| Quality Gates | Verified | Re-run: server hermetic proofs 22/22 + `pnpm typecheck`; client proofs 14/14 + `pnpm typecheck`; it.test 3/3 |
| Vendor / migrations | Verified | Applied `0000`–`0014` not edited; `0015` additive only; `client/src/vendor/ui` untouched in spec 02 commits; lockfiles untouched |
| Non-goals | Verified | No skill CRUD (spec 01); no import/seed/Test Quality/`<untrusted>` wrap (spec 03); no extra editor tabs |
| Commits | Verified | `feat:` prefixes; Related to T1 / T2.0 / T3.0 in Spec 02 |

### Proof Artifacts
| Unit/Task | Proof Artifact | Status | Verification Result |
|-----------|----------------|--------|---------------------|
| 1.0 | `docs/specs/02-spec-skills-agent-binding/02-proofs/02-task-1-proofs.md` | Verified | File present; front-loads context; no credentials |
| 1.0 | `cd server && pnpm exec vitest run test/contracts.test.ts` | Verified | 9 passed (re-run) |
| 1.0 | `cd server && pnpm exec vitest run src/modules/agents/helpers.test.ts` | Verified | 4 passed (re-run; file grew in 3.0) |
| 1.0 | `cd server && pnpm exec vitest run test/agent-skills.it.test.ts` | Verified | 3 passed (re-run with Docker) |
| 1.0 | Migration `0015_handy_vision.sql` | Verified | Additive `enabled` only |
| 1.0 | `cd server && pnpm typecheck` | Verified | `tsc --noEmit` exit 0 |
| 2.0 | `docs/specs/02-spec-skills-agent-binding/02-proofs/02-task-2-proofs.md` | Verified | File present; screenshots embedded with path above image |
| 2.0 | Colocated RTL (`SkillsTab`, helpers, `AgentEditor`) | Verified | 3 + 5 + 2 passed |
| 2.0 | Browser screenshots `02-skills-tab-{initial,reorder,dual-gate,reload}.png` | Verified | Valid PNGs 1839×1704; dual-gate count and persist visible |
| 3.0 | `docs/specs/02-spec-skills-agent-binding/02-proofs/02-task-3-proofs.md` | Verified | File present; live run ids + assembly excerpts; no credentials |
| 3.0 | `src/modules/reviews/helpers.test.ts` | Verified | 2 passed |
| 3.0 | `test/prompt-structured.test.ts` | Verified | 7 passed |
| 3.0 | `RunTraceDrawer.test.tsx` | Verified | 4 passed (`~3 tok` / skills absent) |
| 3.0 | `03-trace-skills-tokens.png` | Verified | Skills (dynamic) `~25 tok`; billing TOKENS `2k→0.4k` |
| 3.0 | `03-trace-skills-omitted.png` | Verified | Prompt assembly shows System + User/diff only |

## Validation Issues

| Severity | Issue | Impact | Recommendation |
|----------|-------|--------|----------------|
| MEDIUM | Relevant Files table omits `server/src/modules/reviews/helpers.ts` (D3). Task 3.6 names it. | Traceability nit; core glue is mapped via the task, not the table. | Add a Relevant Files row for `reviews/helpers.ts` (+ colocated `helpers.test.ts`). |
| MEDIUM | Planning audit FLAG1: native DnD has no RTL/e2e case in CI. | Reorder regressions rely on the 2.0 browser proof. | Optional: RTL `applyDrop` is already covered; add an e2e journey in spec 03 if desired. |
| MEDIUM | Planning audit FLAG2: `executeRuns` is not stubbed in unit tests. | Mitigated: executor source calls `enabledSkillBodies` + `skillsPromptArg`; live runs in 3.0 proof. | Keep 3.6 as the cheap seam; do not boot LLM/diff in hermetic tests. |

No CRITICAL or HIGH issues. `reviewer-core/src/prompt.ts` (+2/−2) filters whitespace-only skill strings so `assembly.skills` is null — allowed “unless a bug is found”; `INJECTION_GUARD` and untrusted wrapping of diffs/specs are unchanged.

## Evidence Appendix

### Git commits analyzed (spec 02 implementation)
| Commit | Message | Maps to |
|--------|---------|---------|
| `4aefa70` | `feat: per-agent skill enable flag and link API` · Related to T1 in Spec 02 | Unit 1 |
| `2e2143e` | `feat: agent editor Skills tab for bind and reorder` · Related to T2.0 in Spec 02 | Unit 2 |
| `9fc6815` | `feat: inject dual-gated skill bodies into review prompts` · Related to T3.0 in Spec 02 | Unit 3 |

Core files in those commits match the task-list Relevant Files (contracts + mirror, schema, migration 0015, agents module, executor, SkillsTab, hooks, `VALID_TABS`, PromptBlock/TraceBody/helpers) plus task-3.6 glue `reviews/helpers.ts`. Supporting extras: proof markdown/PNGs, spec/task/audit docs, drawer `styles.ts`, colocated tests.

Unchanged listed files (already correct, no edit required): `server/src/platform/errors.ts`, `reviews/service.ts`, `client/src/lib/hooks/skills.ts`, `client/messages/en/agents.json`, `server/src/adapters/tokenizer/index.ts`.

### Commands executed this validation
```
cd server && pnpm exec vitest run test/contracts.test.ts src/modules/agents/helpers.test.ts src/modules/reviews/helpers.test.ts test/prompt-structured.test.ts
cd server && pnpm typecheck
cd server && pnpm exec vitest run test/agent-skills.it.test.ts   # 3 passed (Docker)
cd client && pnpm exec vitest run src/app/agents/[id]/_components/AgentEditor src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx
cd client && pnpm typecheck
git diff 4aefa70^..HEAD --name-only
git diff 4aefa70^..4aefa70 --name-only -- 'server/src/db/migrations/00{00..14}*'
rg -i 'sk-|api[_-]?key|password|secret|bearer |token=' docs/specs/02-spec-skills-agent-binding/02-proofs/*.md
file docs/specs/02-spec-skills-agent-binding/02-proofs/*.png
```

### Gateboard
| Gate | Type | Result |
|------|------|--------|
| A | BLOCKER | PASS — no CRITICAL/HIGH |
| B | REQUIRED | PASS — no `Unknown` FR rows |
| C | REQUIRED | PASS — all listed proofs exist and re-ran or are valid PNGs |
| D1 | BLOCKER | PASS — no unmapped core files |
| D2/D3 | non-blocking | D3 MEDIUM on Relevant Files omission of `reviews/helpers.ts` |
| E | REQUIRED | PASS — colocation, hermetic vs `.it.test`, vendor/migrations, non-goals |
| F | REQUIRED | PASS — no real credentials in proofs (agent/run UUIDs only) |

---
**Validation Completed:** 2026-09-19 00:06 EEST
