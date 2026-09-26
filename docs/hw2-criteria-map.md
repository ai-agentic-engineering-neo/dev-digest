# HW2 criteria → where each one is satisfied

Written 2026-09-26 against `hw2-criteria.md`. "Where" names the page, route
or file a grader can open. The two control experiments (17, 18) are manual:
the fixture PR and the exact steps are at the end.

| № | Criterion | Where |
|---|---|---|
| 1 | Root `AGENTS.md` | `AGENTS.md` at the repo root; `CLAUDE.md` is the one-line import `@AGENTS.md` |
| 2 | `AGENTS.md` in server / client / reviewer-core | same pattern in `server/`, `client/`, `reviewer-core/` (and `e2e/`) |
| 3 | UI architecture skill | `.claude/skills/react-frontend-architecture/SKILL.md` (pages, page components, shared components, naming, tests) |
| 4 | Onion architecture skill | `.claude/skills/onion-architecture-backend/SKILL.md` (rings, container, adapters at the edge, no adapter calls from routes; enforced by `pnpm lint:arch`) |
| 5 | pr-self-review skill | `.claude/skills/pr-self-review/SKILL.md` — a workflow that routes changed files to the other skills |
| 6 | Agents under SKILLS LAB | sidebar section SKILLS LAB: Skills, Agents, Conventions (`client/src/vendor/ui/nav.ts`) |
| 7 | Agents page grid | `/agents` |
| 8 | Skills CRUD in Postgres | `GET/POST/PUT/DELETE /skills[/:id]` → `skills` table (`server/src/modules/skills`); covered by `server/test/skills.it.test.ts` |
| 9 | Skills card grid | `/skills`: name, type, description, enabled toggle (+ version, agent count, delete) |
| 10 | Card click → side panel | `/skills` → click a card → `?skill=<id>` opens `SkillPanel` on the right |
| 11 | Add button: create / import | `/skills` → **Add Skill** → *Create from scratch* (modal) / *Import from file* (drawer) |
| 12 | Skill form | create modal: name, description (directive hint), type, Markdown body |
| 13 | Agent Skills tab | `/agents/:id?tab=skills`: attach (checkbox), enable/disable, drag & drop + arrows |
| 14 | Order reaches the prompt | executor renders linked, enabled skills in link order; visible in the run trace's prompt assembly and in `server/test/skills.it.test.ts` («prompt: … in link order») |
| 15 | Import `.md` or `.zip` with preview | `/skills` → Add Skill → Import from file; `POST /skills/import/preview`; examples in `docs/skills/examples/` |
| 16 | At least one linked skill is imported | `deprecation-policy` (source «imported») linked to API Contract Reviewer, imported through the preview flow from `docs/skills/examples/deprecation-policy.zip` |
| 17 | Test Quality control experiment | manual, see below |
| 18 | API Contract control experiment | manual, see below |
| 19 | Skills block + tokens in the trace | PR → Agent runs → trace: «Skills (dynamic) · N skills · T tokens» (server tokenizer, `prompt_assembly.skills_tokens`) |
| 20 | Enabled = own block, disabled = none | same trace: one «↳ Skill · name (vN) · T tokens» block per enabled skill; a disabled skill has no block and no log line, only a count in the summary |
| 21 | pr-self-review manual on a mixed diff | the push hook only checks for a fresh stamp and never runs the review; `/pr-self-review --all` reviews client/ and server/ lanes with both skill sets (report in `.git/pr-self-review/report.md`) |
| 22 | Card: version + agent count | `/skills` card footer: `vN · source · N agents` (`Skill.agent_count`) |
| 23 | Delete on the card | `/skills` card: trash icon |
| 24 | Delete confirmation modal | `ConfirmDialog` (confirm / cancel / ×) — `client/src/components/confirm-dialog` |
| 25 | `/skills/:id` tabs | Config, Preview, Versioning |
| 26 | Preview renders Markdown | `/skills/:id?tab=preview` |
| 27 | Versioning list | `/skills/:id?tab=versioning` (`GET /skills/:id/versions`) |
| 28 | Diff per previous version | **Diff** button → unified diff against the current body (`GET …/versions/:v/diff`) |
| 29 | Restore | **Restore** button → confirm → new version with that body (`POST …/versions/:v/restore`) |
| 30 | Search in the agent Skills tab | filter input on `/agents/:id?tab=skills` |
| 31 | Drag & drop only for enabled | only linked (checked) rows are draggable and carry arrows |
| 32 | Agent card fields | name, description, model, enabled toggle, skill count |
| 33 | Delete on the agent card | trash icon on `/agents` and in the editor's left list |
| 34 | Agent delete confirmation | `ConfirmDialog` |
| 35 | Exactly two agent tabs | Config, Skills |
| 36 | Agent Config fields | name, description, provider, model (dynamic list), review strategy, system prompt (+ CI gate, repo intel) |
| 37 | Skills tab shows every skill | all workspace skills, each with its link toggle and type label |
| 38 | `POST /repos/:id/conventions/extract` | `server/src/modules/conventions/routes.ts`; results persist in `convention_scans` + `conventions` (migration `0011`) |
| 39 | Sample selection without a model | `ConventionsService.collectSamples`: configs + `repoIntel.getConventionSamples(repoId, 12)`, pure code |
| 40 | Candidate shape from the model | `ConventionExtraction` contract: `{ category, rule, evidence_path + evidence_line, confidence }`; verified by `verifyEvidence` |
| 41 | Create-skill modal edits body + metadata | `/conventions` → Create skill: name, description, type, enabled, agent, body textarea |
| 42 | Accepted → `repo-conventions` linked to an agent | `POST /repos/:id/conventions/skill` (default name `repo-conventions`, source `extracted`, linked to the chosen agent) |
| 43 | Four API Contract Reviewer skills | `breaking-change`, `response-schema`, `semver-discipline` (seeded, `server/src/db/seed-skills.ts`) + `deprecation-policy` (imported); each has a directive description and a **Bad / Good** example |
| 44 | Conventions under SKILLS LAB | sidebar |
| 45 | Run Scan / Re-scan | `/conventions` header button: **Run Scan** before the first scan, **Re-scan** afterwards |
| 46 | Candidate cards | rule, evidence file:line, confidence bar + % |
| 47 | Accept / Reject / Edit | three buttons per card |
| 48 | Reject persists | status stored in `conventions.status`; rejected rows survive a re-scan and never enter the skill draft |
| 49 | Edit inline | Edit swaps the rule/category for inputs inside the card |
| 50 | Create skill after ≥ 1 accept | toolbar button appears once something is accepted |
| 51 | Create skill modal | «Merged from N accepted conventions in repo…» banner, Name / Description, Cancel / Create skill |
| 52 | New skill on the Skills page | after Create the app opens `/skills?skill=<id>` with the new card in the grid |
| 53 | Settings → Models → Conventions | `/settings/models`: Conventions row with a searchable model dropdown; stored per workspace, read by the extractor |

## Control experiments (17, 18)

Fixture: draft PR **test: HW2 control-experiment fixture (do not merge)** on
the fork (branch `test/hw2-control-experiment`, base `feat/L02-skills`). It
adds a helper with four failure branches and a test that covers only the
happy path, renames the `Agent.skill_count` response field, and changes the
`PUT /skills/:id` request field `body` → `content`.

1. Add the fork (`ira-horobets/dev-digest`) in DevDigest and import its PRs.
2. **Test Quality Reviewer**: open its Skills tab, uncheck every skill, run it
   on the fixture PR → expected verdict approve (no rule to apply). Re-check
   `uncovered-branch-gate` + `corner-case-checklist`, run again → expected:
   findings on `retry-after.ts` naming the untested branches and the empty /
   negative / past-date cases.
3. **API Contract Reviewer**: same two runs → without skills nothing about
   the contract; with `breaking-change`, `response-schema`,
   `semver-discipline`, `deprecation-policy` linked → the field rename and
   the `body` → `content` change are flagged as breaking.
4. Open each run's trace (Agent runs → trace icon) → Prompt assembly: the
   Skills block with its token count and one block per skill; the run
   without skills has none.
