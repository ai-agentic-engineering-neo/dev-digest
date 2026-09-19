# 05-audit-api-contract-reviewer.md

## Executive Summary
- Overall Status: PASS
- Required Gate Failures: 0
- Flagged Risks: 2

## Gateboard

| Gate | Status | Why it failed (≤10 words) | Exact fix target |
|------|--------|---------------------------|------------------|
| Requirement-to-test traceability | PASS | — | — |
| Proof artifact verifiability | PASS | — | — |
| Repository standards consistency | PASS | — | — |
| Open question resolution | PASS | — | — |
| Regression-risk blind spots | FLAG | Live catch not CI; dual-gate reused | `## Tasks > 3.5`, `2.3` |
| Non-goal leakage | PASS | — | — |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Tests beside source; `*.it.test.ts`; vendor/migrations/lockfiles do-not-touch | none |
| `README.md` | yes | `:3000`/`:3001`, `./scripts/dev.sh` | none |
| `server/AGENTS.md` | yes | No new module; shared SoT; hermetic vs `.it.test` | none |
| `client/AGENTS.md` | yes | Hooks-only API; mocked `fetch` in `pnpm test` | none — no new client files required |
| `reviewer-core/AGENTS.md` | yes | Engine has no DB; `skills?: string[]` already assembled | none — tasks forbid touching it |
| `TESTING.md` | yes | Seams + one Postgres integration; live LLM not a CI gate | none |
| CI workflows + package.json + eslint | yes | `typecheck` / hermetic vs `.it.test` / `lint` | none |
| `CONTRIBUTING.md`, PR template, pre-commit | not found | Searched repo root | fallback: AGENTS + CI |
| `server/INSIGHTS.md` | yes | Transactional skill insert; seed URL three hops | none — 3.2 names `../../../docs/...` |
| `docs/agent-prompts/README.md` | yes | Severity/verdict/findings-discipline; no JSON shape | none — 1.1 + 1.5 encode this |

## Findings

### FLAG Findings (max 2)

1. “Skills on catch the rename” is a live demo, not CI
   - Risk: 3.3 only proves bodies land in `assemblePrompt`. A model that still approves #902 with skills on will not fail `vitest`. Spec non-goal 7 already forbids CI-gating on wording.
   - Suggested remediation: keep 3.5 checklist as the evidence. Do not add a live-LLM job. Optional: in `05-task-3-proofs.md` record whether the on-run cited `user_id` / missing major, without making that a gate.

2. Dual-gate is not re-proven on this agent
   - Risk: 2.3 defers to spec 02. 3.3 passes raw `API_CONTRACT_SKILL_BODIES`, not `ReviewRunExecutor`’s `skills.enabled && agent_skills.enabled` filter. A regression in the executor filter would still pass 05 tests.
   - Suggested remediation: do **not** add a second assembler. Optional: one hermetic/executor test that API Contract’s three enabled links produce three bodies and a disabled link is omitted — only if spec 02’s existing executor test does not already cover “any agent”. Prefer leaving as-is.

## User-Approved Remediation Plan
- Pending approval
