# 03-audit-skills-import-and-test-quality.md

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
| Regression-risk blind spots | FLAG | UI mocks; seed-body drift | `## Tasks > 2.6`, `4.2` |
| Non-goal leakage | PASS | — | — |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocation, `*.it.test.ts`, Zod same-name, vendor/migrations/lockfiles do-not-touch | none |
| `README.md` | yes | `:3000`/`:3001`, `./scripts/dev.sh` | none |
| `server/AGENTS.md` | yes | `routes` → `service` → `repository`; shared SoT; `db:generate` | none |
| `client/AGENTS.md` | yes | Thin pages; hooks-only API; mocked `fetch` in `pnpm test` | none |
| `reviewer-core/AGENTS.md` | yes | Engine has no DB; `skills?: string[]` already assembled | none |
| `TESTING.md` | yes | Seams + one Postgres integration per workflow; live LLM not a CI gate | none |
| CI workflows + package.json + eslint | yes | `typecheck` / hermetic vs `.it.test` / `lint`; no zip lib in server lockfile | none |
| `CONTRIBUTING.md`, PR template, pre-commit | not found | Searched repo root | fallback: AGENTS + CI |
| `server/INSIGHTS.md` | yes | `skills.insert` must be transactional | none |

## Findings

### FLAG Findings (max 2)

1. Import UI tests will not catch a live `POST` body mismatch
   - Risk: `ImportSkillModal.test.tsx` / `SkillsListView.test.tsx` mock hooks (`client/AGENTS.md` gotcha). A renamed field on `POST /skills/import` can still pass `pnpm test`. The Postgres cases in `skills.it.test.ts` are the real contract net.
   - Suggested remediation: keep as-is (TESTING.md: e2e is a few main journeys). Do not add a live-LLM or URL-import e2e. Optional: one RTL test that spies `api.post` path + JSON keys (`filename`, `content_base64`) without booting the API.

2. Hermetic control-experiment bodies can drift from seed; live demo is manual
   - Risk: 4.2 says “inline strings matching the seeded bodies”. If `seed-skills.ts` changes and the test strings do not, CI still passes. Live Test Quality findings and the Security self-review screenshot are operator proofs, not CI (spec non-goal 5).
   - Suggested remediation: export the three Test Quality body constants from `seed-skills.ts` and import them in `prompt-structured.test.ts`. Keep the live-LLM checklist in `03-proofs/03-task-4-proofs.md` — do not add a CI job that asserts model wording.

## User-Approved Remediation Plan
- Pending approval
