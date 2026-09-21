# HW2 skills experiment: runbook and results template

Controlled experiments for acceptance criteria 17 (Test Quality) and 18 (API
Contract), plus the trace, injection, import-origin and DB checks that go with them
(criteria 14, 15, 16, 19, 20, 8).

> **Status: NOT RUN.** This file is the runbook plus an empty results template. The
> experiment needs a live LLM key and a GitHub-connected repo, so it cannot be run
> from CI or by the agent that wrote this document. Every results table below is
> deliberately empty. Fill them from real runs only, keep every run (do not drop
> "bad" ones), and attach the evidence listed in section 8.

## 1. What is being tested

An agent whose base prompt is generic (design decision D10) is run on the same PR
twice: once with its skills unlinked (control) and once with them linked. The claim
under test is that the specifics live in the skills, not the prompt.

| Experiment | Agent | Skills under test | PR | Criterion |
|---|---|---|---|---|
| E1 API Contract | API Contract Reviewer | `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy` | PR-A | 18 |
| E2 Test Quality | Test Quality Reviewer | `test-coverage-nudge` | PR-B | 17 |

Prompts: `docs/agent-prompts/api-contract-reviewer.md` and
`docs/agent-prompts/test-quality-reviewer.md`. Skills:
`docs/agent-skills/api-contract-reviewer/*.md` and `TEST_COVERAGE_NUDGE_BODY` in
`server/src/db/seed-skills.ts`.

Expected outcome, stated before running so it cannot be adjusted afterwards:
without skills the agent reports nothing about the contract change (or only
self-evident defects), with skills it reports it. LLM output is non-deterministic and
the base prompt cannot fully stop a model from using its own knowledge, so the
control may not be perfectly clean. Report what happens.

## 2. Prerequisites

- App running via `./scripts/dev.sh` (Postgres in Docker, API `:3001`, web `:3000`)
  with migrations applied and the seed run (`cd server && pnpm db:migrate && pnpm db:seed`).
- Settings, API Keys: a key for the provider the agents use. Seeded agents use
  `openrouter` / `deepseek/deepseek-v4-flash`; either add an OpenRouter key or change
  the two agents' provider and model in Agents, Config. Use the **same model for every
  run** and record it.
- `GITHUB_TOKEN` (PAT with `repo` scope) available to the app, and a GitHub account
  to host the fixture repo.
- **Existing database caveat.** The seed inserts a skill only if its name is missing,
  so a database seeded before this change keeps the old `test-coverage-nudge` body.
  Open Skills, `test-coverage-nudge`, Config: the body must contain the headings
  "Uncovered branches" and "Boundary cases". If not, either reset the database
  (`docker compose down -v`, then `./scripts/dev.sh`) or paste the current
  `TEST_COVERAGE_NUDGE_BODY` from `server/src/db/seed-skills.ts` (this saves a new
  skill version; record it in section 7).
- Confirm the seed: Agents shows **API Contract Reviewer** with 4 skills linked in the
  order `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`,
  and Test Quality Reviewer with `test-coverage-nudge`.

## 3. Fixture repo

Fixtures live in `docs/experiments/fixtures/`:

| Path | Content |
|---|---|
| `base/` | Base repo tree: Fastify `GET /v1/orders/:id` returning `{ id, total, currency }`, one happy-path test, `openapi.yaml` and `package.json` at `1.3.0`, `CHANGELOG.md` |
| `pr-a-api-contract.patch` | PR-A: `total` renamed to `amount`, `currency` dropped, `:id` renamed to `:orderId`, tests and `openapi.yaml` updated, **no version bump, no changelog** |
| `pr-b-test-quality.patch` | PR-B: new `applyDiscount(order, pct)` with branches `pct < 0`, `pct > 100`, `pct === 0` and a **happy-path-only** test |
| `injection-skill-skil-13.md` | Prompt-injection skill body for the injection demo (section 6) |

The base tree type-checks, and its tests pass on the base and with each patch applied
(verified with `npm install && npx tsc --noEmit && npx vitest run`).

Create the GitHub repo `devdigest-experiments` (empty, no README), then from this
repo's root:

```sh
cp -r docs/experiments/fixtures/base ../devdigest-experiments
cd ../devdigest-experiments
git init -b main
git add -A && git commit -m "Base: orders API v1.3.0"
git remote add origin https://github.com/<you>/devdigest-experiments.git
git push -u origin main

# PR-A
git switch -c pr-a-api-contract main
git apply ../dev-digest/docs/experiments/fixtures/pr-a-api-contract.patch
git add -A && git commit -m "Rename order total to amount, drop currency, rename :id to :orderId"
git push -u origin pr-a-api-contract

# PR-B
git switch -c pr-b-test-quality main
git apply ../dev-digest/docs/experiments/fixtures/pr-b-test-quality.patch
git add -A && git commit -m "Add applyDiscount"
git push -u origin pr-b-test-quality
```

Open two pull requests against `main` on GitHub (PR-A titled e.g. "Simplify order
response", PR-B titled "Add discount helper"). Use neutral titles and descriptions,
and do not mention breaking changes or missing tests in them.

In DevDigest: add the repository (Add repository, `<you>/devdigest-experiments`), open
Pull Requests, Refresh to sync both PRs, and note their numbers.

## 4. Scoring rubric (fixed before running)

A finding "counts" for an issue when it cites the file and lines that contain the
change and its rationale names the mechanism (what breaks for whom). A generic remark
("review the API change") does not count.

**E1, PR-A issues**

| Id | Skill expected to catch it | Issue |
|---|---|---|
| A1 | `breaking-change` | Path parameter renamed `:id` to `:orderId` (`src/routes/orders.ts`, `openapi.yaml`) |
| A2 | `response-schema` | Response field `total` renamed to `amount` |
| A3 | `response-schema` | Response field `currency` removed |
| A4 | `semver-discipline` | Breaking change with no version bump or changelog (`package.json`, `openapi.yaml` `info.version`, `CHANGELOG.md` untouched) |
| A5 | `deprecation-policy` | Field and parameter removed with no deprecation marker, header or changelog entry |

Primary metric for criterion 18: **run flags the breaking change** = at least one of
A1, A2 or A3 counts.

**E2, PR-B issues** (`src/discount.ts`: `pct < 0` line 8, `pct > 100` line 9,
`pct === 0` line 10)

| Id | Issue |
|---|---|
| B1 | Branch `pct < 0` (throws) has no test |
| B2 | Branch `pct > 100` (throws) has no test |
| B3 | Branch `pct === 0` (returns the order unchanged) has no test |
| B4 | Boundary cases untested: `-1/0/1` and `99/100/101`, zero total |

Primary metric for criterion 17: **run flags the gap** = at least one of B1 to B3
(uncovered branch) **and** B4 (boundary case) counts.

Also record, per run: verdict, number of findings, highest severity, findings that do
not match any listed issue (extra findings, judge as plausible or false positive),
run duration and cost.

## 5. Procedure

Repeat each condition **3 times** (more if budget allows), interleaving the
conditions (control, skills, control, skills, ...) rather than running one condition
in a block. Do not re-run a condition because the result looks wrong.

### E1: API Contract (PR-A)

1. **Control, skills unlinked.** Agents, API Contract Reviewer, Skills tab: switch all
   four skills off (unlink) and Save. The tab should read "0 of N enabled".
2. PR-A page, Run Review, pick **API Contract Reviewer** only. Wait for completion.
3. Open the run's trace (PR page, Agent runs, Review runs, log icon). Confirm there is
   **no Skills block** in the prompt assembly (criterion 20). Screenshot.
4. Record the run in table 7.1 (findings, A1 to A5 counts, verdict).
5. **With skills.** Skills tab: switch the four skills on in the order
   `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`, Save.
6. Run Review with the same agent on PR-A. In the trace confirm the separate
   **Skills block** and the token count next to it (criteria 19, 14). Screenshot.
7. Record in table 7.1.

### E2: Test Quality (PR-B)

Same procedure with **Test Quality Reviewer**, PR-B and the single skill
`test-coverage-nudge`. Control = skill switched off on the agent's Skills tab. Record
in table 7.2.

### Trace and ordering checks (criteria 14, 19, 20)

On any with-skills run: the Skills block is separate, shows a token count that
matches roughly `ceil(skills text length / 4)` for that block only (not the whole
prompt), and lists the skill bodies in the linked order. Then, on the API Contract
Reviewer's Skills tab, drag `deprecation-policy` above `breaking-change` (only
enabled rows are draggable), Save, run again, and confirm the block order in the trace
follows. Restore the original order afterwards. Record in table 7.3.

## 6. Other checks

### Import origin (criteria 15, 16)

The seed script sets `deprecation-policy.source = 'extracted'`, so a fresh database
satisfies criterion 16 on paper. That origin is written by the seed, not produced by
the import flow, so also exercise the real flow once:

1. Skills, **Add Skill**, **From file**: pick
   `docs/agent-skills/api-contract-reviewer/deprecation-policy.md`. Set Skill name to
   `deprecation-policy-imported` (the seeded name is taken). Confirm the core preview
   (name, description, body excerpt) appears **before** saving, then import. The card
   should read "Imported".
2. Zip variant: build an archive containing one skill file plus a non-text file and
   import it the same way with the name `breaking-change-zip`. The preview should list
   the non-text entry as ignored.
   - PowerShell: `Compress-Archive -Path docs\agent-skills\api-contract-reviewer\breaking-change.md, docs\experiments\fixtures\base\package.json -DestinationPath breaking-change.zip`
   - bash: `zip breaking-change.zip docs/agent-skills/api-contract-reviewer/breaking-change.md docs/experiments/fixtures/base/package.json`
3. Delete the two extra skills afterwards (or keep them, and note it).

### Injection demo

Skills, Add Skill, From file: import `docs/experiments/fixtures/injection-skill-skil-13.md`
(name `skil-13`). Expected: the skill page shows the red "INJECTION DETECTED, DO NOT
ENABLE" banner, the toggle is disabled, the list card is marked, and in an agent's Skills
tab the row is marked and cannot be linked (the API answers 422 `SKILL_BLOCKED`).
Screenshot each.

### Database check (criterion 8)

```sh
curl -s -X POST http://localhost:3001/skills -H "content-type: application/json" \
  -d '{"name":"db-check","type":"custom","body":"# db check\nbody"}'
docker exec -it devdigest-postgres psql -U devdigest -d devdigest \
  -c "select id, name, source, version from skills where name = 'db-check';"
docker exec -it devdigest-postgres psql -U devdigest -d devdigest \
  -c "delete from skills where name = 'db-check';"
curl -s http://localhost:3001/skills | grep -c db-check   # expect 0
```

## 7. Results (template: fill from real runs only)

Model / provider for all runs: ________ . App commit: ________ . Date: ________ .
`test-coverage-nudge` body version used: ________ .

### 7.1 E1 API Contract, PR-A

| Run | Condition | Run id | A1 | A2 | A3 | A4 | A5 | Flags breaking change (A1-A3) | Verdict | Findings (n / max severity) | Extra findings | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | control (0 skills) | | | | | | | | | | | | |
| 2 | with 4 skills | | | | | | | | | | | | |
| 3 | control (0 skills) | | | | | | | | | | | | |
| 4 | with 4 skills | | | | | | | | | | | | |
| 5 | control (0 skills) | | | | | | | | | | | | |
| 6 | with 4 skills | | | | | | | | | | | | |

| Condition | Runs | Flags breaking change | Hit rate | A1 | A2 | A3 | A4 | A5 |
|---|---|---|---|---|---|---|---|---|
| control (0 skills) | | | | | | | | |
| with 4 skills | | | | | | | | |

### 7.2 E2 Test Quality, PR-B

| Run | Condition | Run id | B1 | B2 | B3 | B4 | Flags gap (branch and boundary) | Verdict | Findings (n / max severity) | Extra findings | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | control (skill off) | | | | | | | | | | | |
| 2 | with test-coverage-nudge | | | | | | | | | | | |
| 3 | control (skill off) | | | | | | | | | | | |
| 4 | with test-coverage-nudge | | | | | | | | | | | |
| 5 | control (skill off) | | | | | | | | | | | |
| 6 | with test-coverage-nudge | | | | | | | | | | | |

| Condition | Runs | Flags gap | Hit rate | B1 | B2 | B3 | B4 |
|---|---|---|---|---|---|---|---|
| control (skill off) | | | | | | | |
| with test-coverage-nudge | | | | | | | |

### 7.3 Trace, ordering and other checks

| Check | Criterion | Run id / where | Observed | Pass |
|---|---|---|---|---|
| Skills block present with skills linked | 19 | | | |
| Token count shown next to the block, block only | 19 | | | |
| Skills block absent with skills unlinked | 20 | | | |
| Reordering skills reorders the block in the trace | 14 | | | |
| From-file `.md` import shows preview, card reads "Imported" | 15, 16 | | | |
| Zip import shows preview and ignored entries | 15 | | | |
| `skil-13` import blocked with banner, not linkable | injection | | | |
| API create, row in DB, delete by SQL, gone from `GET /skills` | 8 | | | |

### 7.4 Interpretation (write after the runs)

- Did the control runs stay quiet? If a control run reported the contract change
  anyway, say so and by which route (own knowledge, the PR description, the diff).
- Difference in hit rate between conditions, with the run counts. With 3 runs per
  condition this is an indication, not a statistical result.
- False positives and extra findings in the with-skills runs.
- Threats to validity: single model, small fixtures, PR-A changes and skill wording
  written by the same author, non-deterministic sampling.

## 8. Evidence checklist

Store screenshots outside the tracked docs tree or in a new
`docs/experiments/evidence/` folder, named by table row, for example
`e1-run2-trace-skills-block.png`.

- [ ] Agent Skills tab with skills off, and with skills on (E1 and E2)
- [ ] Trace of a control run (no Skills block) and of a with-skills run (block and token count)
- [ ] Findings list of at least one run per condition and experiment
- [ ] Reordered skills trace
- [ ] Add Skill, From file preview (md and zip), and the "Imported" card
- [ ] Injection banner, blocked toggle, Skills-tab marking
- [ ] `psql` and `curl` output for the DB check
