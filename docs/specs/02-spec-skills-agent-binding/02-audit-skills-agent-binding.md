# 02-audit-skills-agent-binding.md

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
| Regression-risk blind spots | FLAG | Glue/DnD/e2e not in hermetic tests | `## Tasks > 2.4`, `3.2` |
| Non-goal leakage | PASS | — | — |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocation, `*.it.test.ts`, Zod same-name, vendor/migrations do-not-touch | none (NAV exception was spec 01 only) |
| `README.md` | yes | `:3000`/`:3001`, `./scripts/dev.sh` | none |
| `server/AGENTS.md` | yes | `routes` → `service` → `repository`; shared SoT; `db:generate` | none |
| `client/AGENTS.md` | yes | Thin pages; hooks-only API; mocked `fetch` in `pnpm test` | none |
| `reviewer-core/AGENTS.md` | yes | Engine has no DB; `skills?: string[]` already assembled | none |
| `TESTING.md` | yes | Seams + one Postgres integration per workflow | none |
| CI workflows + package.json + eslint | yes | `typecheck` / hermetic vs `.it.test` / `lint` | none |
| `CONTRIBUTING.md`, PR template, pre-commit | not found | Searched repo root | fallback: AGENTS + CI |

## Findings

### FLAG Findings (max 2)

1. Skills-tab contract drift and DnD are not in CI
   - Risk: `SkillsTab.test.tsx` mocks hooks (`client/AGENTS.md` gotcha), so it will not catch a live `POST` body mismatch. Native HTML5 reorder has no RTL case — only the 2.0 browser proof. Same class of gap as spec 01’s `/skills` FLAG.
   - Suggested remediation: keep as-is (TESTING.md: e2e is a few main journeys). Add an `e2e/` flow in spec 03 when the demo catalog exists, or a thin RTL test that calls the drop handler with two mocked ids and asserts POST order.

2. `ReviewRunExecutor` can skip the helper and still look green
   - Risk: 3.1 (`enabledSkillBodies`) and 3.4 (`assemblePrompt`) pass even if 3.2 never calls them. 3.6 covers omit-vs-pass shape, not that `executeRuns` loads links from the DB.
   - Suggested remediation: keep 3.6 as the cheap seam. Do not boot `executeRuns` in unit tests (diff/LLM/I/O). If you want a stronger net, stub `reviewPullRequest` later — not required for this gate.

## User-Approved Remediation Plan
- Pending approval
