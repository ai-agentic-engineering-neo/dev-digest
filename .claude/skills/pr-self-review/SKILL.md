---
name: pr-self-review
description: >
  Local pre-PR gate that reviews the current branch's diff against main before it becomes
  a GitHub PR — routes changed files to the project's own best-practice skills
  (react-best-practices for UI, onion-architecture/fastify-best-practices/drizzle-orm-patterns
  for backend, security always) and to the general-purpose code-review/security-review
  skills, then blocks opening or merging the PR when a critical finding is found. Use this
  skill whenever the user asks to review changes before opening a PR, asks "is this ready to
  PR", runs `/pr-self-review`, or is about to run `gh pr create`/`gh pr merge` — a
  PreToolUse hook (see README.md) also triggers this automatically. Not a replacement for
  code-review/security-review: it orchestrates them plus the file-specific architecture/UI
  skills, and adds the merge gate on top.
version: "1.0.0"
---

# PR Self Review

Reviews the **diff the PR will actually contain** (committed branch changes vs `main`,
plus any uncommitted work) before it is opened or merged, by routing each changed file to
the project skill that actually governs it, and refuses to let a critical finding pass
silently.

- [routing.md](routing.md) — which skill owns which files, and what always runs regardless
  of file type.
- [gate.md](gate.md) — the severity mapping (what counts as CRITICAL per skill), the
  BLOCKED rule, the status-file schema, and the override/acknowledge protocol.
- [README.md](README.md) — what this skill is, version, hook wiring, requirements.
- `scripts/diff-hash.sh` — hashes the review-relevant diff so a verdict can be cached and
  invalidated correctly.
- `scripts/check-gate.sh` — the gate itself: used both by the `PreToolUse` hook (blocks
  `gh pr create`/`gh pr merge` until a fresh review exists) and manually.

## When this fires

- User runs `/pr-self-review` directly.
- User asks something like "review my changes before I open a PR" / "is this ready to PR".
- Agent is about to run `gh pr create` or `gh pr merge` — the hook in
  [README.md](README.md#hook-wiring) blocks that Bash call until this skill has run for the
  current diff, so treat a blocked `gh pr create` attempt as an instruction to run this
  skill, not to retry the command.

## Algorithm

### Step 0 — Determine scope

Do **not** review only uncommitted changes — a PR is mostly already-committed commits on
the branch. Compute the merge-base against the target branch (`main` unless told
otherwise) and diff from there, plus whatever is still uncommitted:

```bash
BASE_REF=main
MERGE_BASE="$(git merge-base "$BASE_REF" HEAD)"
git diff --name-only "$MERGE_BASE"...HEAD -- . ':(exclude)server/src/db/migrations/**' ':(exclude)**/pnpm-lock.yaml' ':(exclude)**/package-lock.json'
git status --porcelain
```

Exclude generated/do-not-touch paths from [AGENTS.md](../../../AGENTS.md) — migrations and
lock files — from every step below. They are never reviewed, never bucketed, never counted
toward the gate.

If the combined file list is empty, report "nothing to review" and stop — do not spawn any
subagents.

### Step 1 — General passes (always, whole scoped diff)

Don't reimplement correctness/security review — call the skills that already do it, scoped
to the file list from Step 0:

- `security` skill (or the `security-review` command if invoked as a skill in this session)
  — runs on the full scoped diff, every time, regardless of file type.
- `code-review` (default effort) — runs on the full scoped diff for general correctness
  bugs.

### Step 2 — Route domain files to domain skills (fan-out)

Using [routing.md](routing.md), bucket the Step-0 file list by skill. For each **non-empty**
bucket, dispatch one `Agent` call (subagent_type `general-purpose` or `Explore` — this repo
has no dedicated `react-architecture-analyzer`/`code-reviewer` agent type) in parallel,
giving that subagent only:

- the diff hunks for its bucket's files (not the whole repo, not unrelated buckets),
- the one skill's instructions (via the `Skill` tool or by quoting its SKILL.md),
- an explicit instruction: **flag only lines actually added/changed by this diff** —
  pre-existing code in the same file that the diff didn't touch is context, not a finding.
  A domain skill run over a whole legacy file will otherwise resurface old issues unrelated
  to this PR and train the user to ignore the gate.

Each subagent reports findings through `ReportFindings` (file, line, summary,
failure_scenario, category) — no free-text findings.

### Step 3 — Aggregate and classify

Collect findings from Steps 1–2, dedupe (the same line can be flagged by `security` and a
domain skill), and classify each as CRITICAL/HIGH/MEDIUM using the mapping in
[gate.md](gate.md). Count `critical_count`.

### Step 4 — Write the verdict

```bash
HASH="$(bash .claude/skills/pr-self-review/scripts/diff-hash.sh main)"
STATUS_FILE="$(git rev-parse --git-dir)/pr-self-review-status"
cat > "$STATUS_FILE" <<EOF
diff_hash=$HASH
verdict=$( [ "$CRITICAL_COUNT" -ge 1 ] && echo BLOCKED || echo PASS )
critical_count=$CRITICAL_COUNT
high_count=$HIGH_COUNT
medium_count=$MEDIUM_COUNT
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ack=false
ack_hash=
ack_reason=
ack_timestamp=
EOF
```

(Substitute the actual counts computed in Step 3 — this is illustrative, not literal shell
to paste unedited.)

### Step 5 — Report and gate

Print the findings table (grouped CRITICAL / HIGH / MEDIUM) and the verdict line, exactly
as specified in [gate.md](gate.md#report-format).

- **PASS** → nothing further required; `gh pr create`/`gh pr merge` will now be allowed by
  the hook.
- **BLOCKED** → do **not** run `gh pr create`/`gh pr merge` yourself. Tell the user which
  critical findings were found and that the hook will keep blocking the PR until either the
  findings are fixed (re-run this skill after fixing) or the user **explicitly** confirms an
  override in chat. Only after an explicit, unambiguous confirmation from the user, run:
  ```bash
  bash .claude/skills/pr-self-review/scripts/check-gate.sh --acknowledge "<one-line reason / quote of the user's confirmation>"
  ```
  and then include the audit note from [gate.md](gate.md#override-audit-trail) in the PR
  body when you do open it.

## Relationship to sibling skills

This skill does not duplicate `code-review`, `security-review`, or any of the domain
skills (`react-best-practices`, `onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `next-best-practices`,
`frontend-ui-architecture`, `react-testing-library`, `zod`, `typescript-expert`) — it only
decides *which* of them run on *which* files, aggregates their output, and adds the
merge gate. Read [routing.md](routing.md) for the actual bucket table.
