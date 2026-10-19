---
name: pr-self-review
description: "Local pre-PR gate for DevDigest: reviews ALL local changes (unmerged commits + staged + unstaged + untracked) by routing each changed file to the project skills that own it (frontend skills on client/, onion-architecture/fastify/drizzle on server/, zod/security/typescript where they apply), runs typecheck + arch:check + CLAUDE.md project rules, verifies every critical finding, and BLOCKS opening or merging the PR while any critical remains. Use this skill before every `gh pr create` / `gh pr ready` / `gh pr merge`, whenever the user says 'open a PR', 'create a pull request', 'ready for review', 'self-review', 'review my changes', 'check my diff before PR', 'перевір зміни', 'відкрий PR', 'чи можна мержити', or runs /pr-self-review — and whenever the PreToolUse gate blocked a PR command."
disable-model-invocation: true
argument-hint: "[--base <branch>] [--quick] [--with-tests] [--no-cache] [--waive <id>=\"reason\"] [--post-status]"
metadata:
  version: "1.0.0"
  updated: "2026-10-18"
---

# PR Self-Review

A review gate that runs **before** a pull request exists. It looks at everything
that would go into the PR, applies each project skill only where it is the
right lens, and refuses to let a PR open while a verified critical finding
remains. Design and rationale: [README.md](README.md).

The scripts do the deterministic parts: diff collection, routing, grounding,
caching and the verdict. You orchestrate the reviewers and talk to the user.
Run every command from the repo root. `S=.claude/skills/pr-self-review/scripts`.

## Arguments

| Flag | Effect |
|---|---|
| `--base <branch>` | PR target (default `origin/main`). Use the same base as `gh pr create --base`. |
| `--quick` | Deterministic checks only. Fast, but its verdict does **not** unlock the PR. |
| `--with-tests` | Also run unit tests of touched packages. |
| `--no-cache` | Re-review every file, ignoring cached per-file results. |
| `--waive <id>="reason"` | Waive one critical. **Only when the user gave this id and reason themselves.** |
| `--post-status` | After the verdict, publish it as GitHub commit status `devdigest/self-review`. |

## Workflow

### 1. Collect and route

```bash
node $S/prepare.mjs [--base <branch>] [--no-cache]
```

This prints the fingerprint, a REVIEW or cached line per reviewer group, any
files no skill covers, warnings, and `RUN_DIR=…`. Read
`$RUN_DIR/manifest.json` for the groups.

- `NO_CHANGES` → tell the user there is nothing to review and stop.
- Pass on every `WARN` line to the user. A skill that is not routed, or a route
  to a missing skill, means `routing.json` needs an update.

### 2. Deterministic checks

```bash
node $S/checks.mjs --run $RUN_DIR [--with-tests]
```

Runs project rules (migrations, contract twins, secrets, INJECTION_GUARD) and
typecheck/arch:check for touched packages. A failure becomes a critical with no
LLM involved. If `--quick`, jump to step 5 with `--quick`.

### 3. Reviewers, all in parallel

For each group in `manifest.groups` with a non-empty `files` array, build a
prompt from [references/reviewer-prompt.md](references/reviewer-prompt.md):

- `{{skillPath}}`, `{{diffPath}}`, `{{outputPath}}`, `{{groupId}}`, `{{skill}}`: from the group;
- `{{severityPath}}`: `.claude/skills/pr-self-review/references/severity.md`;
- `{{moduleDocs}}`: the group's `moduleDocs`;
- `{{base}}`: the manifest base;
- `{{fileList}}`: one line per file, as `path — changed lines <changedLines>`.

Spawn **all** of them in a single message with the Agent tool
(`subagent_type: "general-purpose"`, description `review:<groupId>`). Each one
works in a clean context with one skill and only its own files. That is what
keeps frontend rules off backend files and stops one skill's rules from
leaking into another's findings. Groups with only `cachedFiles` are not run;
their earlier results are replayed.

When an agent finishes without writing its output file, re-run that single
group once. If it fails again, leave it: finalize marks the review
*incomplete*, which blocks. A skipped reviewer must never turn into a silent
pass.

### 4. Verify criticals

```bash
node $S/finalize.mjs --run $RUN_DIR --stage candidates
```

This grounds every finding first. A finding whose quote does not exist in the
code is dropped, and one on an unchanged line becomes `info`. Then it lists the
fresh critical candidates with their ids and `verify output` paths. For each
candidate, spawn one verifier from
[references/verifier-prompt.md](references/verifier-prompt.md), all in one
message. Fill the placeholders like this:

- `{{findingJson}}`, `{{id}}`, `{{file}}`: the candidate's object and fields
  in `$RUN_DIR/candidates.json`;
- `{{mergeBase}}`: from the manifest;
- `{{skillPath}}`: from the group whose `skill` equals the candidate's `source`;
- `{{verifyPath}}`: the printed `verify output` path.

The verifier's job is to *refute*. A refuted critical becomes major. A
critical that was never verified stays critical (fail-safe). Skip this step
when there are 0 candidates.

### 5. Verdict

```bash
node $S/finalize.mjs --run $RUN_DIR [--quick] [--waive <id>="reason" ...]
```

This prints the report and `VERDICT=PASS|BLOCK|QUICK-PASS`, and writes the
verdict the gate reads, the per-file cache, `report.md` and
`pr-body-section.md`.

### 6. Tell the user

Lead with the verdict. Then:
- list every critical with its id, `file:line`, why and fix;
- give majors as a short list;
- give counts for the rest, and mention anything dropped, uncovered or
  incomplete.

Don't paste the whole report when it is long. Point to `$RUN_DIR/report.md`.

- **BLOCK:** say plainly that the PR cannot be opened or merged until the
  criticals are fixed, then offer to fix them. After fixes, re-run from step
  1. Unchanged files come from the cache, so only touched groups run again.
- **Waivers are the user's call, not yours.** Never add `--waive` on your own
  initiative or to get past the gate. If the user wants to accept a critical,
  ask them for the reason and pass exactly that. It ends up in the verdict and
  in `pr-body-section.md`.
- **PASS**, and the user asked to open a PR: append
  `$RUN_DIR/pr-body-section.md` to the PR body, then run `gh pr create`. The
  gate hook lets it through only for the exact fingerprint that passed. Any
  later edit needs a new review.
- `--post-status`: confirm with the user first (it publishes to GitHub).
  Then commit and push, and run `node $S/post-status.mjs [--base …]`.

## The gate

`.claude/settings.json` registers `node $S/gate.mjs` as a PreToolUse hook on
Bash. It blocks `gh pr create|ready|merge` unless the current fingerprint has a
full `pass` verdict. When it blocks, run this skill. Don't work around the
hook: no rewording the command, no other tool to create the PR. For pushes
outside Claude Code, `node $S/gate.mjs --cli` works as a git `pre-push` hook.
The README explains how to enable it.

## Gotchas

- The fingerprint covers the content of every changed file against the
  merge-base. Committing reviewed changes keeps it valid. Editing a file,
  rebasing onto a new base, or changing `--base` invalidates it.
- The cache key includes the skill file and the prompt/severity references.
  Editing a skill re-reviews its files automatically.
- `next-best-practices` is `user-invocable: false`, which doesn't matter here:
  reviewers read the SKILL.md file directly.
- Routing lives in [routing.json](routing.json). When adding a skill to
  `.claude/skills/`, add its route there or list it in `notReviewers`.
