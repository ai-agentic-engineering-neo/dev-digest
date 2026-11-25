# PR Self Review skill — implementation plan

Date: 2026-11-24 · Status: **implemented (P0–P7); open: branch protection admin step (P5)** · Owner: TBD

## 1. Goal

A project skill `pr-self-review` that reviews **all local, not-yet-merged changes** against the
repo's own skills before a pull request is opened, and **blocks** the PR (and, at the CI level,
the merge) when at least one CRITICAL finding is confirmed.

- Runs **manually** (`/pr-self-review`) or **automatically** before every PR is opened.
- Picks skills per file: UI skills on `client/` files, backend/architecture skills on
  `server/` + `reviewer-core/` files — only for files that are in the diff.
- Verdict: `PASS` (no CRITICAL) / `BLOCK` (≥1 confirmed CRITICAL).

Non-goals: replacing human review or the DevDigest product reviewer; re-reviewing legacy code
the diff did not touch; fixing findings automatically (could be a later `--fix` mode).

## 2. What exists today (inputs to the design)

| Fact | Consequence for the design |
|---|---|
| 13 skills in `.claude/skills/`, catalog with a `Scope` column (Backend / Frontend / Full-stack / Shared) in `.claude/skills/README.md` | The scope column is the seed of the skill→path map, but it is too coarse (e.g. `drizzle-orm-patterns` is irrelevant to a route file) → need path globs + content triggers |
| `onion-architecture` scope: `server/src/**`, `reviewer-core/src/**`; `frontend-ui-architecture` scope: `client/src/**` | The two "own" architecture skills are the primary reviewers per side |
| Severity vocabularies differ: product contract `CRITICAL / WARNING / SUGGESTION` (`server/src/vendor/shared/contracts/findings.ts:11`); `react-best-practices` CRITICAL/HIGH/MEDIUM; `security` has its own CRITICAL table | Normalize everything to the product's 3-level enum with an explicit rubric (§6) |
| Deterministic gates already exist: `lint` / `typecheck` / `test` scripts per package, server depcruise gate `server/test/architecture.test.ts` with a known-violations baseline | Run these first — cheaper and more reliable than an LLM for the rules they cover |
| Hooks live in `.claude/settings.json` (engineering-insights read/guard/wrapup); scripts are `.mjs` under the skill folder | Follow the same layout: `hooks/*.mjs`, `scripts/*.mjs` |
| `.devdigest/cache/` is git-ignored | Store verdicts/reports there |
| Vendored contracts must change in both `server/src/vendor/shared` and `client/src/vendor/shared` (CLAUDE.md) | Cheap deterministic cross-package check worth including |
| No monorepo; pnpm in `client/`, `server/`; npm in `reviewer-core/`, `e2e/` | Mixed lockfiles are a deterministic CRITICAL; commands run per package |

## 3. File layout (as built)

```
.claude/skills/pr-self-review/
  SKILL.md                    # workflow the agent follows (steps in §5), waive, gate notes
  skill-map.json              # skill → globs + content triggers + refs to load (§4)
  references/
    severity-rubric.md        # what is CRITICAL vs WARNING vs SUGGESTION (§6)
    reviewer-prompt.md        # prompt template for one (skill × file-bucket) reviewer
    verifier-prompt.md        # adversarial prompt for confirming a CRITICAL
  scripts/
    collect.mjs               # diff scope + skill mapping + diff hash → runs/<hash16>/plan.json
    checks.mjs                # repo rules + lint/typecheck/tests of touched packages → checks.json
    units.mjs                 # review units + reviewer prompts; `criticals` → verifier prompts
    findings.mjs              # severity normalization, stable finding ids, result readers
    verdict.mjs               # PASS/BLOCK/INCOMPLETE → verdicts/<diffHash>.{json,md}; `waive`
    ci.mjs                    # CI entry: repo rules + which suites to call + annotations
    install-git-hook.mjs      # opt-in installer for hooks/git-pre-push.mjs
  hooks/
    pr-gate.mjs               # PreToolUse hook: gh pr create / git push (open PR) need a fresh PASS
    git-pre-push.mjs          # optional git pre-push hook (P7): pushed commit needs a PASS
  test/                       # node:test: collect, checks, verdict/units, pr-gate, ci (fixture repos)
```

Runtime artifacts (git-ignored): `.devdigest/cache/pr-self-review/runs/<hash16>/` (plan,
checks, units/, verify/), `verdicts/<diffHash>.{json,md}`, `waivers.json`.

Edits elsewhere: `.claude/settings.json` (registers the hook), `.claude/skills/README.md`
(catalog row), root `CLAUDE.md`, `docs/ONBOARDING.md`, `TESTING.md`,
`.github/workflows/pr-self-review.yml` (new, §7 level 3) and `client.yml` /
`server-unit.yml` / `reviewer-core.yml` (`pull_request` trigger → `workflow_call`).

## 4. Skill → file mapping (`skill-map.json`)

Matching = path glob **AND/OR** content trigger (an import or a token in the changed hunks).
A skill runs only if ≥1 changed file matches; it receives only the matching files.

| Skill | Path globs | Extra content triggers | Notes |
|---|---|---|---|
| frontend-ui-architecture | `client/src/**/*.{ts,tsx}` | — | primary UI reviewer; load `references/structure.md`, `components.md`, `data-and-logic.md` |
| react-best-practices | `client/src/**/*.tsx`, `client/src/lib/hooks/**` | — | its CRITICAL tag maps 1:1 |
| next-best-practices | `client/src/app/**`, `client/next.config.*`, `client/src/middleware.ts`, `client/src/i18n/**` | `'use client'`, `next/` imports | remind about Next 15 / next-intl 3 (client INSIGHTS) |
| react-testing-library | `client/**/*.test.{ts,tsx}` | — | WARNING max (tests never block on style) |
| onion-architecture | `server/src/**`, `reviewer-core/src/**` | — | primary backend reviewer; only **new** dependency-rule violations, legacy ones are in the depcruise baseline |
| fastify-best-practices | `server/src/**/{routes,http,plugins}/**`, `server/src/app.ts`, `server/src/server.ts` | `fastify` import | |
| drizzle-orm-patterns | `server/src/db/**`, `**/*repository*.ts` | `drizzle-orm` import | |
| postgresql-table-design | `server/src/db/schema/**`, `server/drizzle/**`, `**/*.sql` | `pgTable(` | |
| zod | `**/vendor/shared/**` | `from 'zod'` | |
| security | `server/src/**`, `reviewer-core/src/**`, `client/src/**` | `fetch(`, `exec`, `secrets`, `dangerouslySetInnerHTML`, headers/CORS | always on for code; its CRITICAL table maps 1:1 |
| typescript-expert | any `*.ts(x)` | — | low priority: run only if total agents < cap (§5 step 5) |
| mermaid-diagram, engineering-insights | — | — | **excluded** (not code-review skills); listed explicitly so the completeness check passes |

Files outside every mapping (docs, lockfiles, CI yaml, `e2e/specs/*.json`) get deterministic
checks only (§5 step 3). `e2e/**` .ts files: `typescript-expert` + e2e/CLAUDE.md conventions
(deterministic locators, no `chat`).

**Completeness check:** `collect.mjs` fails if a directory in `.claude/skills/` is neither in
the map nor in `excluded` — so a newly vendored skill can't be silently ignored.

## 5. Workflow (what SKILL.md tells the agent to do)

1. **Collect the diff scope** — `node scripts/collect.mjs [--base origin/main]`
   - `git fetch origin main` (best-effort), base = `git merge-base HEAD origin/main`.
   - Changes = committed on the branch since base + staged + unstaged + untracked (not ignored).
     "All open changes" means all four; `--staged-only` / `--committed-only` flags for later.
   - Skip binaries, lockfiles' content (only note that they changed), generated files.
   - Output `plan.json`: files with hunks, the package each belongs to, matched skills,
     a **diff hash** (sha256 of the full diff incl. untracked content) and `HEAD` sha.
   - Empty diff → print "nothing to review" and exit.
2. **Load context** — for each touched package read its `CLAUDE.md` and `INSIGHTS.md`
   (the reviewers get the relevant INSIGHTS lines; several are effectively rules).
3. **Deterministic gates** — `node scripts/checks.mjs` runs, only for touched packages,
   with the right package manager (client via `npx -y pnpm@10`, per client INSIGHTS):
   `lint`, `typecheck`, `test`; server: `architecture.test.ts`; reviewer-core change →
   also server typecheck (CLAUDE.md rule). Plus cheap repo rules:
   - only one vendored `shared` copy changed → CRITICAL (contract drift);
   - `package-lock.json` in a pnpm package or `pnpm-lock.yaml` in an npm package → CRITICAL;
   - `package.json` changed without its lockfile (or vice versa) → WARNING;
   - secrets-looking strings, `.env`, `~/.devdigest/secrets.json` content → CRITICAL;
   - non-English text added to docs/comments → WARNING.
   A failing lint/typecheck/test = CRITICAL with the command output as evidence.
4. **Build review units** — one unit = (skill × its matched files). Large buckets are split
   by package/folder so a unit stays under ~1.5k changed lines.
5. **Run reviewers in parallel** — one fresh-context subagent per unit (Agent tool,
   `general-purpose`, model **Sonnet**, D5), prompt from `references/reviewer-prompt.md`:
   - inputs: the skill's SKILL.md (+ listed references), the hunks, full text of the changed
     files, the severity rubric, relevant INSIGHTS lines;
   - rule: report only problems **introduced or worsened by this diff**; pre-existing issues
     go to an `info` list, never CRITICAL;
   - every finding must cite the skill rule it violates (`skill`, section/line) and
     `file:line` + a quoted evidence snippet; no citation → dropped.
   - output: JSON `{ findings: [{ severity, skill, rule, file, line, title, evidence, fix }] }`.
   - Cap: ≤ 8 reviewer agents per run (project guideline < 10); priority when over the cap:
     architecture skills → security → others; skipped units are listed in the report.
6. **Verify CRITICALs** — each CRITICAL goes to a second, adversarial subagent
   (model **Opus**, D5; `references/verifier-prompt.md`) that sees the code, the cited rule and the finding and
   answers `confirmed | downgrade(WARNING) | reject` with a reason. Only confirmed ones block.
   This is what keeps false positives from blocking PRs.
7. **Verdict** — `node scripts/verdict.mjs` merges deterministic + LLM findings, dedups
   (same file/line/rule), writes:
   - `.devdigest/cache/pr-self-review/<diff-hash>.json` — `{ verdict, diffHash, head, base,
     counts, findings, skippedUnits, waivers, createdAt }`
   - `.devdigest/cache/pr-self-review/<diff-hash>.md` — human report grouped by severity,
     then by file; a short summary block suitable for the PR description.
8. **Report to the user** — counts per severity, every CRITICAL with `file:line` + fix hint,
   and the verdict. On `BLOCK`: say the PR must not be opened; offer to fix the findings.

## 6. Severity rubric (`references/severity-rubric.md`)

Normalized to the product enum `CRITICAL / WARNING / SUGGESTION`.

**CRITICAL (blocks)** — only if introduced by the diff and one of:
- failing lint / typecheck / tests / depcruise architecture test;
- a **new** inward-only violation (onion: inner ring imports an outer ring; frontend:
  `lib → components → app` direction broken, runtime import from `@devdigest/shared`);
- security CRITICAL per the `security` skill table (secret in code, injection, missing
  auth/host-guard on a route, unsafe exec);
- bug-class rules tagged CRITICAL in the source skill (e.g. react-best-practices: hooks
  rules, broken reconciliation; floating promise in long-lived server code);
- contract drift between the two vendored `shared` copies; mixed package managers.

**WARNING** — maintainability/structure issues the skill states as "should" (wrong folder,
oversized component, business logic in a component, missing Zod validation on an internal
boundary). **SUGGESTION** — style and nice-to-haves. Neither ever blocks, whatever the
count (D2).

Mapping table for skills with their own scales: react-best-practices CRITICAL→CRITICAL,
HIGH/MEDIUM→WARNING; security CRITICAL→CRITICAL, HIGH→WARNING (or CRITICAL if
remotely exploitable — verifier decides), lower→SUGGESTION.

## 7. "Forbid merging" — enforcement levels

A skill alone cannot stop anything; enforcement comes from hooks/CI around it.
Honest limits are listed per level.

| Level | Mechanism | Blocks | Can be bypassed by |
|---|---|---|---|
| 1. Agent gate (required) | `hooks/pr-gate.mjs` as a `PreToolUse` hook on `Bash` in `.claude/settings.json`: if the command matches `gh pr create` (also `gh pr merge`, `git push` to a branch with an open PR — configurable), it computes the current diff hash and requires a verdict file with that hash and `PASS`. Missing/stale → exit 2 with "run /pr-self-review first" (Claude then runs the skill: this is the "automatically before every PR" trigger, it also covers `/ship`). `BLOCK` → exit 2 with the CRITICAL list. | PRs opened by Claude Code via Bash | A human running `gh`/the GitHub UI directly; the desktop app's own "Create PR" button if it doesn't go through Bash (verify during implementation) |
| 2. Local git hook (optional) | `pre-push` hook (installed by an opt-in `scripts/install-git-hook.mjs`, not by default) that only *checks* the verdict file for the pushed diff; it does not run the LLM review | Pushes from any tool on that machine | `--no-verify`, not installing it |
| 3. GitHub merge block (real "cannot merge") | Workflow `pr-self-review.yml` + branch protection on `main` with it as a **required check**. Options: (a) run the same review in CI via the Claude Code GitHub Action (cost per PR, needs an API key secret); (b) dogfood: run DevDigest's own reviewer on the PR and fail on CRITICAL; (c) cheapest: only deterministic gates in CI (already mostly covered by the 5 existing workflows) | Merge in GitHub for everyone | Repo admins |

Decision (D1, D4 in §10): **level 1** gates `gh pr create` and `git push` to a branch with
an open PR. **Level 3 option (c)** is the real merge block: a deterministic required check.
Level 2 stays optional. A local verdict file is never a trusted merge gate, because anyone
can write it.

**Waivers (D3):** a CRITICAL the user disagrees with can be waived only explicitly
(`/pr-self-review waive <finding-id> "<reason>"`). A reason is required and no second
approver is needed. Waivers are stored in the verdict and printed in the report and the PR
summary. A stale diff hash drops all waivers.

## 8. Implementation phases

| Phase | Scope | Done when |
|---|---|---|
| P0 | Decisions in §10 | done (2026-11-24) |
| P1 (done 2026-11-24) | `collect.mjs` + `skill-map.json` + completeness check + tests on fixture diffs | `node collect.mjs` on this branch lists `client/package.json` with no LLM skills and a "package.json without lockfile?" check; a fixture touching `client/src/app/**` and `server/src/modules/**` gets the expected skill sets |
| P2 (done 2026-11-24) | `checks.mjs` (deterministic gates per touched package). Exit codes: 0 no CRITICAL · 3 CRITICAL · 4 a gate could not run (e.g. missing `node_modules`; verdict must not be PASS). Server integration tests are opt-in (`--integration`, needs Docker). A test fixture that must keep a fake credential marks the line with `pr-self-review: allow-secret` | failing typecheck in a fixture → CRITICAL with output; untouched packages not run |
| P3 (done 2026-11-24) | SKILL.md + reviewer/verifier prompts + `units.mjs` (split/cap, prompt files) + `findings.mjs`. Run artifacts per diff in `.devdigest/cache/pr-self-review/runs/<hash16>/`, verdicts in `verdicts/<diffHash>.{json,md}`, waivers in `waivers.json`. Verified end to end on a temp worktree: a seeded change (shell-interpolated `execSync` in a git adapter + state mutation before `setState`, both invisible to ESLint/depcruise) → 6 Sonnet reviewers, 2 CRITICALs confirmed by Opus verifiers → BLOCK (exit 3); a clean test-only change → PASS (exit 0). Known limitation: the same defect reported by two skills appears twice (e.g. as a react CRITICAL and a frontend-architecture WARNING) — ids are per skill, no cross-skill merge yet. Earlier note: (adding `pr-self-review/SKILL.md` makes the completeness check fail until `pr-self-review` is added to `excluded` in skill-map.json) + severity rubric; `verdict.mjs` | on a seeded-violation branch (server domain file importing `drizzle-orm`; client component calling `apiFetch` directly; route without validation) the run reports confirmed CRITICALs and `BLOCK`; on a clean branch `PASS` |
| P4 (done 2026-11-24) | `pr-gate.mjs` hook + registration in `.claude/settings.json`; waiver command. Parses the shell command (quotes, `&&`/`;`/`|`, env prefixes, `cd`, `git -C`, `gh --repo … pr create`); `--dry-run`/`--delete`/`--help` are not gated; open PR checked with `gh pr view --json state` (unknown → not gated); a failure to compute the diff fails closed. Checked live: `true \|\| gh pr create` was refused in this session; a plain command costs ~30 ms, a `git push` ~0.6 s (the `gh` call). Not verified: whether the desktop app's own "Create PR" button goes through Bash — if not, it bypasses level 1 (level 3 still applies) | `gh pr create`, and `git push` to a branch with an open PR, are refused without a verdict, with a stale one or with BLOCK, each with a clear message; with a fresh PASS (or every CRITICAL waived with a reason) they go through |
| P5 (done 2026-11-24, except the admin step) | Implemented: `.github/workflows/pr-self-review.yml` runs on every PR into `main` → job `rules` (`scripts/ci.mjs`: the same repo rules as the local skill + `::error`/`::warning` annotations + job summary + which suites the diff touches) → calls `client.yml` / `server-unit.yml` / `reviewer-core.yml` as reusable workflows (their own `pull_request` trigger removed, `push` to main kept) → job `gate` fails on any failure/cancel. depcruise runs inside server-unit's unit tests (`test/architecture.test.ts`). Not required: server-integration, e2e-web. **Admin step (not done — a repo setting, not code):** Settings → Branches → `main` → require status checks → add `gate` (from pr-self-review); or `gh api -X PUT repos/<owner>/<repo>/branches/main/protection -F required_status_checks[strict]=true -F 'required_status_checks[contexts][]=gate' -F enforce_admins=false -F required_pull_request_reviews=null -F restrictions=null`. Until then CI reports but does not block merges. Original scope: `pr-self-review.yml` deterministic workflow (depcruise, `vendor/shared` diff, lockfile/package-manager check; reuses the existing lint/typecheck/test jobs) + branch protection on `main` requiring it and the existing checks | a PR that changes only one `vendor/shared` copy fails the required check and can't be merged; branch protection is set by a repo admin (manual step, documented) |
| P6 (done 2026-11-24) | Docs: skills README catalog (+ "map a new skill" note), root CLAUDE.md (Map, conventions, "Read when": before opening a PR), docs/ONBOARDING.md (§5 item 9), TESTING.md (P5), root INSIGHTS entries | docs updated |
| P7 (done 2026-11-24, opt-in) | Level 2 pre-push hook: `hooks/git-pre-push.mjs` + `scripts/install-git-hook.mjs` (`--status`, `--uninstall`; refuses to overwrite a foreign hook or write into `core.hooksPath`). Checks only branches with an open PR (`gh pr list --head`), and the PUSHED COMMIT's hash (`diffHashForCommit` = the clean-tree hash, verified equal incl. renames/binaries), never the working tree; no LLM. Tested with a real `git push` to a bare remote: refused → PASS verdict → allowed → new commit refused → branch delete allowed. Not installed in this checkout — installing it is each developer's choice | opt-in installer works |

Testing: `node --test '.claude/skills/pr-self-review/test/*.test.mjs'` for the scripts (Node 24
does not accept a bare directory, pass the glob) and the hook
(hook tested by piping recorded `PreToolUse` JSON on stdin). The LLM part is checked by the
two fixture branches in P3 (one must BLOCK, one must PASS) — re-run after any prompt change.

## 9. Risks

- **False-positive blocks** → verifier pass, mandatory rule citation, "introduced by this
  diff only", waivers.
- **Cost/latency** (up to ~8 reviewers + verifiers per run) → deterministic gates first;
  stop early if they already produce a CRITICAL (`--fail-fast`, default on); cache verdict by
  diff hash so re-running on an unchanged diff is free.
- **Vendored skills are generic** (e.g. `security` targets Express/MongoDB) → the reviewer
  prompt says to apply only rules that fit our stack (Fastify/Drizzle/Postgres).
- **Skill drift** → completeness check fails on an unmapped skill; the map lives next to the
  skill and is reviewed with it.
- **Hook matching is string-based** (`gh pr create` inside a longer shell line) → match on
  the parsed command tokens, and test aliases (`gh pr create --fill`, `env … gh pr create`).

## 10. Decisions (2026-11-24)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Merge blocking level | **Level 1** (local agent gate) **+ level 3 option (c)**: a deterministic required check in CI with branch protection on `main`. No LLM review in CI for now. | Level 1 is the stated goal (check local changes before the PR). Lint/typecheck/test already run in the `client`, `server-unit` and `reviewer-core` workflows, so (c) is cheap: it reuses those jobs and adds the depcruise test, the `vendor/shared` drift check and the mixed-lockfile check. CI stays free and deterministic. An LLM merge gate on GitHub would block on non-deterministic output. Revisit (a) Claude Action or (b) DevDigest dogfooding after a few weeks of level-1 data on false-positive rates. |
| D2 | Do WARNINGs block? | **Never.** | A "> N warnings" threshold pushes people to split PRs or ignore the report. WARNINGs show in the report and in the PR summary. |
| D3 | Waivers | **Allowed, reason required, no second person.** | Without waivers one false positive halts work, and level 1 can be bypassed with `gh` anyway, so strictness buys nothing. Transparency does: every waiver and its reason goes into the PR summary, and the PR reviewer acts as the second person. |
| D4 | Gate triggers | **`gh pr create` and `git push` to a branch that already has an open PR.** `gh pr merge` is not gated locally (D1 covers merges in CI). | Without the push trigger anything can be pushed after the first PASS. The diff-hash cache makes a re-check of an unchanged diff free. Check for an open PR with `gh pr view --json state` (no PR or no network → push is not gated). |
| D5 | Models | **Reviewers: Sonnet. CRITICAL verifier: Opus.** No Haiku. | Up to 8 reviewers per run make a broad, shallow pass, so this is the volume and the cheaper tier fits. The verifier runs only per CRITICAL, so rarely, but it decides whether the PR is blocked, so the stronger model goes there. Haiku is too weak for the ring/layer reasoning the onion and frontend-architecture rules need. |
