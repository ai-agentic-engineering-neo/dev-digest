---
name: pr-self-review
description: "Self-review of the current branch before a pull request is opened: collects the change set, runs the deterministic checks (typecheck, lint, lint:arch, unit tests, contract-copy drift, do-not-touch paths, secrets), routes every changed file to the repo's own skills (react-frontend-architecture, react-best-practices, next-best-practices, react-testing-library for client/; onion-architecture-backend, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design for server/; zod, typescript-expert, security everywhere), reviews each package lane with those skills, verifies the findings, writes a report, and stamps a verdict that a hook enforces on `gh pr create` and `git push`. One critical finding blocks. Use it whenever the user wants to open, prepare, or push a PR, asks for a self review, a pre-PR check, 'is this ready to merge', 'review my changes', 'check my diff', or when the gate hook refuses a push. Run it even if the user only says 'open a PR': the gate will demand it anyway. Manual form: /pr-self-review [--all|--staged|--branch] [--no-tests] [--ci]."
argument-hint: "[--all | --staged | --branch] [--no-tests] [--with-it] [--ci]"
allowed-tools:
  - "Bash(.claude/skills/pr-self-review/scripts/*)"
  - "Bash(./.claude/skills/pr-self-review/scripts/*)"
  - "Read"
  - "Grep"
  - "Agent"
metadata:
  tags: review, pull-request, gate, pre-push, quality, security, architecture
---

# PR self review

Reviews what is about to become a pull request, with the same skills a
teammate would apply by hand, and refuses to let a change with a critical
finding leave the machine. It has a deterministic half (scripts) and a
judgment half (lane subagents plus a verification pass). Keep them apart:
tools decide facts, the model decides meaning, and the gate trusts only the
stamp the model writes at the end.

All scripts live in `scripts/` and write under `.git/pr-self-review/`, which
is never committed. Default change set is `--all`: merge base with
`upstream/main` to the working tree, untracked files included, because a
pre-PR check that ignores unstaged work reviews the wrong code. Use
`--branch` in CI, where only commits exist.

## Workflow

Run the steps in order. Do not skip the verification pass to save time; it is
the only thing standing between a subagent's guess and a blocked push.

### 1. Collect and route

```
scripts/changed-files.sh [mode] base      # confirm the base is what you expect; `git fetch upstream` if stale
scripts/prepare-lanes.sh [mode]           # routing.json + lanes/<package>.diff + lanes/<package>.txt
```

Print the lane summary to the user before anything else: which packages,
how many files, which skills. If a lane has zero files, it does not run. If
`routing.json` lists excluded files that look like source, say so; they are
reviewed by nobody otherwise.

### 2. Precheck

```
scripts/precheck.sh [mode] [--no-tests] [--with-it] [--no-toolchain]
```

Runs typecheck, lint, `lint:arch`, and unit tests for every touched package,
then the repo-rule checks from `reference/severity.md`. Exit 1 means at least
one critical. Do not stop here: continue to the lanes so the author gets the
whole picture in one pass, but the verdict is already `block`. In CI pass
`--no-toolchain`; the per-package workflows already ran the tools. Locally,
`--no-tests` is acceptable for a quick iteration, never for the final run
before the PR.

### 3. Lane review, in parallel

For every lane in `routing.json`, spawn one read-only subagent with the prompt
in `reference/lane-prompt.md`, all in the same turn. Each gets its lane's
`.diff` and `.txt`, the paths to the routed skills' `SKILL.md`, and the
severity reference. Each writes `.git/pr-self-review/findings/<package>.jsonl`.

Why per package and not one reviewer: a branch here can carry a hundred
files; a single reviewer would skim, and skim is where the criticals hide.
Why the skills and not a generic prompt: the point of vendoring
`react-frontend-architecture` or `onion-architecture-backend` is that their
rules are this repo's rules. A generic reviewer reinvents weaker ones.

For correctness bugs beyond the skills' scope, the built-in `/code-review`
skill is a fourth lane when time allows; its findings merge into the same
list with `rule: "code-review:<category>"`.

### 4. Verify

```
scripts/tally.sh list > .git/pr-self-review/findings/to-verify.jsonl
```

Send that numbered list to one verification subagent with the second prompt
in `reference/lane-prompt.md`. It confirms, downgrades, upgrades, or
dismisses each finding against the actual file and writes
`.git/pr-self-review/verdicts.jsonl`. Then:

```
scripts/tally.sh apply       # counts; final.json (dismissals of non-dismissable precheck findings are ignored)
scripts/tally.sh report      # the Critical / Warnings / Info / Dismissed tables
```

### 5. Report and stamp

Write the report to `.git/pr-self-review/report.md` using the template below
and show it to the user. Then:

```
scripts/stamp.sh write --verdict <pass|block> --critical <n> --warning <n> [mode]
```

`pass` only when confirmed criticals are zero. The stamp is keyed by a hash
of the reviewed tree, so any later edit makes it stale and the gate asks for a
new run. That is intended: a review of code that no longer exists is not a
review.

### 6. Wrap up

Run the `engineering-insights` wrap-up for every package the review found
something non-obvious in. A false positive that came from a repo quirk (a
contract file already drifted on `main`) is exactly the kind of entry it wants.

## Report template

```
# PR self review — <branch> vs <base_ref> (<mode>)

**Verdict: BLOCK — 2 critical, 7 warning**   (or  **Verdict: PASS — 0 critical, 7 warning**)

## Coverage
| Lane | Files | Skills | Precheck |
|---|---|---|---|
| server | 23 | onion-architecture-backend, fastify-best-practices, … | typecheck ok, lint ok, lint:arch ok, test:unit ok |
| client | 28 | react-frontend-architecture, … | typecheck ok, lint ok, test ok |
Not routed: <files no rule matched, or "none">

## Critical
| # | File | Rule | Finding | Fix |
|---|---|---|---|---|

## Warnings
| # | File | Rule | Finding | Fix |
|---|---|---|---|---|

## Info
- one line each

## Dismissed
| # | Original | Why |
|---|---|---|

Stamp: <verdict> for tree <sha8>, <timestamp>. Gate: gh pr create / git push <allowed|blocked>.
```

Keep the tables sorted by severity then file. A finding row names the skill
section in `Rule` so the author can read the reasoning, not just the verdict.

## The gate

`.claude/settings.json` registers `scripts/gate.sh` as a PreToolUse hook on
Bash. It refuses `gh pr create` and `git push` when the stamp is missing,
stale, or `block`, and tells the model to run this skill. It runs no review
itself. `PR_SELF_REVIEW_SKIP=1` bypasses it for a deliberate emergency push;
say so in the PR description when you use it.

The merge itself can only be blocked by GitHub: the workflow in
`.github/workflows/pr-self-review.yml` runs this skill in `--branch --ci`
mode and fails on critical. Making that check required in branch protection
on the org repo is the last step and needs an owner there.

## Flags

| Flag | Effect |
|---|---|
| `--all` (default) | merge base to working tree, untracked included |
| `--staged` | merge base to index |
| `--branch` | merge base to HEAD; what CI sees |
| `--base <ref>` | override the base branch |
| `--no-tests` | precheck skips unit tests |
| `--with-it` | server precheck runs `*.it.test.ts` too (needs Postgres) |
| `--ci` | shorthand for `--branch` plus `--no-toolchain`; report goes to stdout for the PR comment |

## Files

- `scripts/changed-files.sh` — the change set: `base`, `list`, `diff`, `tree`
- `scripts/route.sh` — file to lane and skills; `--lanes`, `--json`
- `scripts/prepare-lanes.sh` — writes per-lane diffs for the subagents
- `scripts/precheck.sh` — deterministic checks, findings JSON
- `scripts/tally.sh` — merges precheck + lanes + verdicts; `list`, `apply`, `report`
- `scripts/stamp.sh` — `write`, `check`, `show`, `clear`
- `scripts/gate.sh` — the PreToolUse hook
- `reference/routing.md` — the routing table, human-readable
- `reference/severity.md` — what is critical, what is not, what can be dismissed
- `reference/lane-prompt.md` — subagent prompts for lanes and verification
