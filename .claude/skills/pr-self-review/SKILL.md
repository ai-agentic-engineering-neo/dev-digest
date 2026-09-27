---
name: pr-self-review
description: "Self-review of the open local changes before a pull request is opened. Use when the user runs /pr-self-review, asks to check the changes before opening a PR, or when the PreToolUse gate refuses `gh pr create`. Collects the whole open diff (committed on the branch + uncommitted + untracked), routes every changed file onto the project skills that actually govern it — UI skills on UI files, backend/architecture skills on backend files — runs each lane, verifies every CRITICAL candidate, and writes a verdict that blocks `gh pr create` while any confirmed CRITICAL stands. Trigger terms: pr self review, самоперевірка, перед PR, before opening a PR, pre-PR check, blocked by pr-self-review."
allowed-tools: Bash, Read, Grep, Glob, Agent
metadata:
  type: workflow
  tags: review, pre-pr, conventions, routing, severity, gate
---

# PR Self Review

**Type: Workflow — a skill dispatcher.** It owns no review rules of its own. It
collects the diff, decides which of the project's knowledge skills govern each changed
file, runs those skills as lanes, and aggregates their findings into one verdict. The
rules live in the skills it dispatches to (`onion-architecture`,
`frontend-ui-architecture`, `fastify-best-practices`, `react-best-practices`, …).

Check the open changes against the project's own skills **before** they become a pull
request. One confirmed `CRITICAL` → the PR does not get opened.

This is not `/code-review`. That one hunts for bugs in a diff; this one checks the diff
against the conventions encoded in `.claude/skills/` and in the `AGENTS.md` files, and it
owns the merge gate. Run both if you want both — they are deliberately separate.

## How it starts

| Path | What happens |
|---|---|
| `/pr-self-review [--base <ref>] [--scope branch\|working] [--force] [--tests]` | full run |
| `gh pr create` / `gh pr ready` | `scripts/guard-pr.sh` (PreToolUse hook) refuses with `exit 2` unless a fresh, non-blocking verdict exists |

The hook never runs the review — it only reads the artifact. When it fires, run this skill.

## Git is allowed here

This skill reads git freely (`diff`, `status`, `rev-parse`, `merge-base`, `ls-files`) —
that is its whole input. It still **writes** nothing to git: no commit, no push, no
branch, no stash, no checkout. It decides whether the user may open the PR; the user
opens it.

## Tests

Not run by default: they are slow and share the test database. Default gates are static
(`typecheck`, `arch:check`). With `--tests`, run the unit lanes of the affected packages
only — `client`: `pnpm test`, `server`: `pnpm exec vitest run --exclude '**/*.it.test.ts'`,
`reviewer-core`: `npm test`. Never the `*.it.test.ts` lane, never `e2e`.

## The run

### 0 — collect

```bash
.claude/skills/pr-self-review/scripts/collect-diff.sh --format json > /tmp/psr-files.json
```

Scope defaults to `branch` = committed against the merge-base **plus** uncommitted
**plus** untracked. `--scope working` drops the committed half. The base is `--base`, else
the branch upstream, else `origin/main`; if none resolves the script exits 3 — ask, do not
guess. Zero files → say so and stop, and write no verdict.

Report `skipped` (a file over 1500 changed lines is not reviewed) out loud. Silently
dropping it is how a CRITICAL gets missed.

### 1 — route

```bash
.claude/skills/pr-self-review/scripts/route-skills.sh > /tmp/psr-lanes.json
```

The table lives in `rules/routing.md`; the script is that table, executable. **Print the
coverage map to the user before analysing anything** — `skill → n files`, plus the
unrouted count. It is the only evidence that the lane set was derived rather than assumed.

A lane with zero files is not run. A lane that should exist and does not means
`rules/routing.md` is wrong — fix the rule, not the run.

### 2 — deterministic gates

Cheap, no model, and historically the source of most real CRITICALs. Run every gate whose
package appears in the diff:

| Gate | Command / check | Severity when it fails |
|---|---|---|
| typecheck | `cd client && pnpm typecheck` · `cd server && pnpm typecheck` · `cd reviewer-core && npm run typecheck` | CRITICAL |
| architecture | `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs` | CRITICAL |
| contract copies | a file under `*/vendor/shared/` changed in one copy only (`diff -r server/src/vendor/shared client/src/vendor/shared`) | CRITICAL |
| secrets | a key/token/`.env` value added by the diff | CRITICAL |
| migrations | `DROP TABLE` / `DROP COLUMN`, or a timestamp prefix that is not today (`date +%Y_%m_%d`) | CRITICAL / WARNING |
| lockfiles | `pnpm-lock.yaml` / `package-lock.json` changed with no `package.json` change | CRITICAL |

### 3 — lanes

One subagent per lane, up to 4 in parallel, each read-only. Give each: its
`skill_file`, its file list, the diff of those files, and the output contract from
`rules/severity.md`. A lane reports only on **its own** files and only rules from **its
own** skill. The always-on conventions lane (`rules/repo-conventions.md`) covers every
file, including the unrouted ones.

### 4 — verify

Every CRITICAL candidate is re-checked before it counts: open the file, confirm the
pattern is really there at that line, and write the failure scenario. Cannot do all
three → it is a WARNING. This is the same grounding gate `reviewer-core` applies to model
output, and it is what keeps the block trustworthy.

### 5 — verdict

Deduplicate (same file:line from two lanes = one finding, both skills credited), then:

```bash
jq -n '[ ... findings ... ]' \
  | .claude/skills/pr-self-review/scripts/write-verdict.sh \
      --base origin/main --scope branch --files 42 --skills "onion-architecture,security"
```

Writes `.claude/pr-self-review/last-run.json` (read by the hook) and `last-run.md` (a
report you can paste into the PR body). `blocked = CRITICAL > 0`. Add `--override` only
when the user explicitly said so — it is recorded in the artifact.

Then report in the chat, in Ukrainian: verdict line, coverage map, CRITICAL findings in
full (`file:line`, lane, failure scenario, fix), WARNING/SUGGESTION one line each. No
retelling of the diff.

## Bypass

`/pr-self-review --force` (writes `--override`) or `PR_SELF_REVIEW_OVERRIDE=1 gh pr create`.
Only on an explicit instruction from the user, never on your own judgement that a finding
is unimportant.

## Never

- Fix the code during the review. Report, then let the user decide; fixing mid-review
  invalidates the verdict you are about to write (the dirty hash changes).
- Edit `last-run.json` by hand — `write-verdict.sh` is the only writer.
- Lower a severity to unblock a PR. The rubric in `rules/severity.md` decides; if the
  rubric is wrong, change the rubric in its own commit.
- Run `*.it.test.ts`, e2e, migrations, or anything that touches the database.

Files: `rules/routing.md` · `rules/severity.md` · `rules/repo-conventions.md` ·
`examples.md` (what is and is not a CRITICAL here).
