---
name: pr-self-review
version: 1.0.0
description: "Reviews the full branch diff against `main` before a GitHub
  PR is opened — routes changed files to the matching project skills (UI
  skills for client/ files, architecture skills for server/ files), runs
  each as a review pass, and blocks proceeding to `gh pr create`/`git
  push`/`gh pr merge` if any CRITICAL finding is open. Enforced by a
  PreToolUse hook (.claude/settings.json), not just advice. Use before
  opening a pull request, or run manually (/pr-self-review) to self-review
  pending changes."
---

# PR Self Review

Routes the changes about to become a PR to the project skills that
actually apply to them, runs each as a review pass, and gates opening the
PR on the result. For the file→skill routing table, see
[references.md](references.md). For the hook that turns "CRITICAL found"
into an actual blocked `git push`/`gh pr create`, see
[scripts/check-gate.sh](scripts/check-gate.sh) and the `PreToolUse` entry
in `.claude/settings.json`.

**See also, and don't duplicate:**
- Built-in `code-review` / `security-review` skills — general-purpose,
  whole-diff review. This skill is a *routing + gating* layer on top of
  them: it decides *which* project skill(s) apply to *which* changed
  files, and falls back to `code-review` (medium effort) for anything
  those don't cover (see references.md).
- [engineering-insights](../engineering-insights/SKILL.md) — a different
  moment (end of session, capture-only). Run both when relevant; they
  don't overlap.

## Severity Levels

Reuses the exact vocabulary already used in this repo's own review
product (`Severity` enum in
`server/src/vendor/shared/contracts/findings.ts`, and every prompt in
`docs/agent-prompts/`) rather than the CRITICAL/HIGH/MEDIUM scale used by
some other project skills (e.g. `onion-architecture`) — this skill's job
is specifically to decide pass/fail for a PR, so it uses the same
three-level, blocking-aware scale the product itself gates CI on:

- **CRITICAL** — blocks the PR. A real bug, a security hole, a broken
  contract/invariant introduced by this diff.
- **WARNING** — worth fixing, doesn't block. Surfaced in the report.
- **SUGGESTION** — optional improvement. Surfaced in the report.

## Workflow

### 1. Compute the diff

```bash
git fetch origin main --quiet || true   # best-effort; don't fail offline
git diff main...HEAD                    # the merge-base diff — what GitHub would show in the PR
git diff --name-only main...HEAD        # changed file list, for routing
```

If the diff is empty, report "nothing to review — no changes vs. `main`"
and stop. This also covers manual invocation on a clean branch.

If `git diff --shortstat main...HEAD` shows more than ~1500 changed lines
or ~40 files, say so upfront ("large diff — this may take a while, and a
smaller PR would review faster/more reliably") and proceed anyway — don't
silently do a partial review.

### 2. Route changed files to skills

Match each changed file against the table in
[references.md](references.md) and build a `skill → [files]` map. A file
can be routed to more than one skill (e.g. a Fastify route file goes to
both `onion-architecture` and `fastify-best-practices`); a skill only
reviews the files actually routed to it, not the whole diff.

Any changed file matched by **no** row falls back to the built-in
`code-review` skill at medium effort, scoped to just those files, so
nothing goes unreviewed.

### 3. Run each matched skill as a review pass

For each skill in the map: invoke it with the `Skill` tool to load its
instructions, then apply its checklist/anti-patterns to the diff hunks of
*only* the files routed to it. Do not re-read files outside that skill's
assignment for that pass.

### 4. Collect and ground findings

Each finding: `{ file, start_line, end_line, source_skill, severity,
category, rationale, suggestion }` — the same shape as `Finding` in
`server/src/vendor/shared/contracts/findings.ts`.

**Grounding is mandatory** (same principle as `reviewer-core/CLAUDE.md`):
a finding's line range must intersect an actual changed/added line in the
diff hunks for that file. Drop anything that only touches unchanged
context lines or pre-existing code the PR didn't introduce — a skill
scanning a whole file (e.g. `onion-architecture` on a route file) must not
be allowed to block a PR over code that file already had before this
branch touched it.

### 5. Apply waivers, then deduplicate

- Drop any CRITICAL finding that matches a non-expired entry in
  [waivers.json](waivers.json) (same `file` + `line`, `expiresAt` in the
  future) from the *gate*, but keep it in the report, labeled `(waived:
  <reason>)`.
- Merge findings from different skills that land on the same file/line
  range into one entry with combined rationale, rather than reporting the
  same location twice.

### 6. Report and persist

Show the user: counts by severity, findings grouped by file (each with
source skill + rationale + suggestion), which skills ran on which files.

Then write `.state/last-review.json` (create the `.state/` dir if
missing) so the `PreToolUse` hook can enforce this outside the current
conversation too:

```json
{
  "headSha": "<git rev-parse HEAD>",
  "baseSha": "<git merge-base main HEAD>",
  "hasCritical": false,
  "criticalCount": 0,
  "warningCount": 0,
  "suggestionCount": 0,
  "reviewedAt": "<ISO 8601 timestamp>"
}
```

`baseSha` is the **merge-base** of `main` and `HEAD`, not `main`'s tip —
`main` advancing with new commits doesn't change this and doesn't require
a re-review (the three-dot diff wouldn't change either); a **rebase**
does change it, and correctly invalidates the cached result.

### 7. Gate the decision

- Any un-waived `CRITICAL` finding → tell the user explicitly the PR must
  not be opened/merged until it's fixed, and do not run `gh pr create`
  yourself even if that's literally what was asked — this is the one
  point where this skill's instructions override the literal request. The
  `PreToolUse` hook (`scripts/check-gate.sh`) enforces the same rule at
  the tool-call level, independent of this conversation.
- Only `WARNING`/`SUGGESTION` → proceed, but surface them.

## Files in this skill

- `references.md` — the file→skill routing table
- `scripts/check-gate.sh` — the `PreToolUse` hook script; reads
  `.state/last-review.json`, blocks (`exit 2`) `gh pr create`/`gh pr
  merge`/`git push` when stale or `hasCritical: true`
- `waivers.json` — git-committed, team-visible suppressions for
  acknowledged false positives
- `.state/` — gitignored; this run's cached result, not team state
