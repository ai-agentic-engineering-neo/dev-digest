# 04-audit-conventions-extractor.md

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
| Regression-risk blind spots | FLAG | UI mocks fetch; empty git read ≠ missing | `## Tasks > 2.0`, `1.4` |
| Non-goal leakage | PASS | — | — |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocation, `*.it.test.ts`, Zod same-name, vendor/migrations do-not-touch | NAV exception granted by spec (`nav.ts`) |
| `README.md` | yes | `:3000`/`:3001`, `./scripts/dev.sh` | none |
| `server/AGENTS.md` | yes | `routes` → `service` → `repository`; shared SoT; `db:generate` | none |
| `client/AGENTS.md` | yes | Thin pages; hooks-only API; mocked `fetch` | none |
| `reviewer-core/AGENTS.md` | yes | No DB; do not change unless bug | none — tasks forbid touching it |
| `TESTING.md` | yes | Seams + one Postgres integration per workflow; live LLM not CI | none |
| CI + package.json + eslint | yes | `typecheck` / hermetic vs `.it.test` / `lint` | none |
| `CONTRIBUTING.md`, PR template, pre-commit | not found | Searched repo root | fallback: AGENTS + CI |
| `server/INSIGHTS.md` | yes | `.nullish()` empty POST; skills insert in transaction | compose via `SkillsService` |

## Findings

### FLAG Findings (max 2)

1. Conventions UI is not in e2e; RTL mocks `fetch`
   - Risk: `ConventionsView.test.tsx` will not catch a live `ConventionList` / PATCH body mismatch (`client/AGENTS.md` gotcha). API is covered by `conventions.it.test.ts`; the browser seam is only the 2.8 / 3.7 screenshots.
   - Suggested remediation: keep as-is (TESTING.md: e2e is a few main journeys). Add an `e2e/` flow later if the lab demo needs CI on extract → accept → compose.

2. `MockGitClient.readFile` returns `''` for unknown paths, not a throw
   - Risk: Task 1.4 grounds `fileText | null`. If extract treats empty string as “file exists”, a model path that missed the clone can survive the gate with a bogus snippet check against `''`.
   - Suggested remediation: in `groundCandidate`, treat `null` **and** empty/whitespace-only text as missing; assert that in `helpers.test.ts`. Map `readFile` catch **and** `''` to missing in `service.ts`.

## User-Approved Remediation Plan
- Pending approval
