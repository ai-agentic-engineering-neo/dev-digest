# 01-audit-skills.md

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
| Regression-risk blind spots | FLAG | Client tests mock fetch; no e2e `/skills` | `## Tasks > 2.0` / e2e later |
| Non-goal leakage | FLAG | Card delete extra vs unit-2 FRs | `## Tasks > 2.4` |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocation, `*.it.test.ts`, Zod same-name, vendor/migrations do-not-touch | NAV edit allowed only as spec-01 exception (`client/src/vendor/ui/nav.ts`) |
| `README.md` | yes | `:3000`/`:3001`, `./scripts/dev.sh` | none |
| `server/AGENTS.md` | yes | `routes` → `service` → `repository`; shared SoT; `db:generate` | none |
| `client/AGENTS.md` | yes | Thin pages; hooks-only API; mocked `fetch` in `pnpm test` | none |
| `TESTING.md` | yes | Seams + one Postgres integration per workflow | none |
| CI workflows + package.json + eslint | yes | `typecheck` / hermetic vs `.it.test` / `lint` | none |
| `CONTRIBUTING.md`, PR template, pre-commit | not found | Searched repo root | fallback: AGENTS + CI |

## Findings

### FLAG Findings (max 2)

1. No browser e2e for `/skills` in this task list
   - Risk: RTL mocks `fetch` (`client/AGENTS.md` gotcha), so list/editor tests will not catch contract drift against the live Fastify module. Integration tests cover the API; the UI seam to the real server is only the manual browser proof in 2.0 / 3.0.
   - Suggested remediation: keep as-is for spec 01 (TESTING.md: e2e is a few main journeys, not every lesson). Add an e2e flow when spec 03 closes the demo path — or add `e2e/` coverage in a follow-up if you want CI on the create/preview/restore loop.

2. Skill card delete is not a numbered unit-2 FR
   - Risk: Task 2.4 copies `AgentCard`’s trash button. Unit 1 requires `DELETE /skills/:id`; unit 2’s UI FRs list toggle/search/create, not delete. Small extra, justified by “reuse Agents pattern”, but it is still past the written UI list.
   - Suggested remediation: keep if you want parity with agents; otherwise drop the trash control from 2.4 and leave delete API-only until a later spec.

## User-Approved Remediation Plan
- Pending approval
