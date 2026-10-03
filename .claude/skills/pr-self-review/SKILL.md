---
name: pr-self-review
version: 1.0.0
description: "Reviews the local diff (working tree + unpushed commits) across all four packages before a PR goes up: routes changed files to the matching domain skills (frontend-ui-architecture, onion-architecture, security, drizzle-orm-patterns, etc. — see routing.md), runs this repo's own CLAUDE.md hard rules (do-not-touch paths, vendor mirroring, migration immutability, secrets, test coverage — see enforced.md), and blocks with a clear BLOCKED verdict on any critical finding. Use before opening a PR, before running `gh pr create`, when asked 'is this ready to merge/ship', or via /pr-self-review. Does NOT replace generic bug-hunting (use code-review) or lint/typecheck (this skill runs them itself as a fast-fail gate first)."
---

# PR Self-Review

Routes the local diff to the domain skills that actually own each changed
file, plus this repo's own hard rules from the root `CLAUDE.md`, and
produces one severity-tagged, pass/fail verdict before a PR is opened.

Routing table: [routing.md](routing.md). Hard-rule checklist:
[enforced.md](enforced.md). Worked example (diff → routing → report):
[examples.md](examples.md).

This is a *process* skill — it doesn't carry its own domain opinions. It
orchestrates the 13 other skills in `.claude/skills/` against the parts of
the diff each one owns, and adds the checks none of them own (CLAUDE.md's
own do-not-touch list, secrets, test coverage).

## Non-goals

- Not `code-review` (generic correctness/bug-hunting) or `security-review`
  — those stay separate, general-purpose passes; step 6 below shows where
  to optionally chain into `code-review` for one more pass over the same
  diff.
- Not a lint/typecheck replacement — step 0 runs the real `pnpm
  lint`/`pnpm typecheck` per package rather than re-implementing them.
- Not a CI gate. This runs in the developer's own session, before or
  instead of `gh pr create`. Nothing here is enforced by a harness hook
  yet — see "Manual enforcement" at the end.

## Workflow

Work through these steps in order. Steps 2–5 can be parallelized across
independent forks; step 0 must complete (and pass) before any fork is
spawned.

### Step 0 — Fast-fail gates

For every package with at least one changed file, run its own gate:

```sh
cd <package> && pnpm lint && pnpm typecheck
```

(`client/`, `server/`, `reviewer-core/`, `e2e/` — only the ones actually
touched). If the `mcp__ide__getDiagnostics` tool is available, call it too
— it's near-instant and needs no process spawn.

Any failure here is reported immediately as a `CRITICAL` finding under a
`## Fast-fail gate` heading, and **the workflow stops** — do not proceed to
steps 1–6, and do not treat this as one finding among many. There is no
value in a semantic architecture review of code that doesn't compile or
lint clean.

### Step 1 — Compute diff scope

1. Determine the default branch: `git remote show origin` (fall back to
   `main` if that fails or the repo has no remote — this repo uses `main`).
2. `base=$(git merge-base origin/<default-branch> HEAD)`.
3. Scope = union of:
   - `git diff $base...HEAD` (committed, unpushed changes)
   - `git diff HEAD` (staged + unstaged changes in the working tree)
   - untracked files from `git status --porcelain` (`??` entries)
4. Build a file list with change type (added/modified/deleted/renamed).
   Classify a rename/delete by its new (or last-known) path.
5. **Empty scope** → report "No local changes to review" and stop; there's
   nothing to gate.
6. **Diff-too-big guard** — if the scope exceeds ~40 files or ~1500 changed
   lines, add a standing `MEDIUM` finding ("N files changed — this is
   plausibly M separate PRs, consider splitting") before continuing, and
   cap each domain fork (step 3) to at most ~15 files at a time so no
   single pass silently truncates its own context.

### Step 2 — Route changed files to skills

Load [routing.md](routing.md) and, for every changed file, collect the
skill(s) whose path pattern or content signal matches it. Build a list of
`(skill, file-subset)` pairs; drop any pair whose file-subset is empty.
Keep the list of skills that matched **zero** files too — they go in the
final report as "skipped" so the routing decision is inspectable.

A file can match more than one row (e.g. a module change that also touches
a DB schema file matches both the module row and the schema row) — every
matched skill gets its own pass over that file; passes are never
deduplicated across skills.

### Step 3 — Hard-rule checklist (runs regardless of routing)

Work through every item in [enforced.md](enforced.md) against the full
diff scope from step 1 — inline in this session (mostly `grep`/`git diff
--stat`), not as a fork. These are checks CLAUDE.md states directly and
that no single domain skill owns.

### Step 4 — Fan out domain review forks

For each `(skill, file-subset)` pair from step 2, spawn one
`Agent({subagent_type: "fork", ...})` call. All pairs from this step run in
parallel (send them in one message with multiple tool calls). Prompt
template for each fork:

> Load the `<skill>` skill via the Skill tool. Then review only these
> files against it: `<file list>`. Here is the diff for those files:
> `<patch hunks>`. For files under ~400 lines, here is their full current
> content: `<content>`. Report findings as a JSON array:
> `{severity: "critical"|"high"|"medium", file, line, rule, summary}[]`.
> Use `<skill>`'s own severity vocabulary where it defines one (most
> already tag CRITICAL/HIGH/MEDIUM) rather than inventing a new scale.
> Report only real findings — an empty array is a valid, good result.

### Step 5 — Verify pass on criticals only

Collect every finding tagged `critical` from step 3 and step 4. For each
one, spawn one more fork: give it the full file plus the specific claim,
and ask "given the full file and its surrounding module, is this actually
true?" This is the same review → verify shape `code-review` already uses.

- A finding that **survives** verification stays `critical` and can block
  the verdict.
- A finding that does **not** survive is downgraded to `high` and marked
  `(flagged, not verified)` in the report — it still shows up, it just
  can't block on its own.

Skip this step for `high`/`medium` findings — they're non-blocking either
way, so verifying them isn't worth the fork.

### Step 6 — Aggregate and report

1. Combine: fast-fail results (step 0, only reached this point if they
   passed), hard-rule results (step 3), verified domain findings (step 5).
2. Sort `critical` → `high` → `medium`, grouped by file.
3. Verdict:
   - Any surviving `critical` → **`BLOCKED — N critical finding(s), do not
     open the PR`**.
   - Otherwise → **`PASS — N high, M medium (non-blocking)`**.
4. List which skills ran (with file counts) and which were skipped (zero
   matching files) — this makes the routing decision visible rather than a
   black box. Use the report shape in [examples.md](examples.md).
5. Write `.claude/state/pr-self-review.json`: `{diffHash, verdict,
   findings, timestamp}`, where `diffHash` hashes the exact file set +
   content from step 1. This is what a future `PreToolUse` hook (not part
   of this skill — a separate `.claude/settings.json` change) would read
   to gate `gh pr create` itself; today it's also what makes incremental
   re-review possible (below).
6. **On `PASS`**, also produce a draft PR description grouped by the same
   domains used for routing ("Frontend: …", "Backend: …", "Schema: …") and
   hand it back as something to paste into `gh pr create --body` — not
   posted anywhere automatically.

### Incremental re-review

If `.claude/state/pr-self-review.json` already has an entry for a file
whose content hash is unchanged since that entry was written, reuse its
cached `(skill, verdict)` results instead of re-forking it in step 4/5.
Only files that are new or changed since the last run need a fresh pass.
This keeps repeated re-runs after a small fix roughly as cheap as the
finding count that actually changed, not the full diff size again.

## Manual enforcement (this skill, as-is)

There is no harness-level hook yet — enforcement is this skill's own
discipline:

- On `BLOCKED`, do not run `gh pr create` / `gh pr edit --ready` on the
  user's behalf. Say so plainly and point at the blocking finding(s).
- **Override:** if the user believes a specific `critical` finding is a
  false positive, re-run with `/pr-self-review --acknowledge <rule-id>`.
  The acknowledged finding still appears in the report (marked
  `acknowledged`) but no longer counts toward the verdict. This still
  requires a fresh run — acknowledging doesn't silently persist across an
  otherwise-changed diff, since `diffHash` changes.
- A harness-enforced hard block (denying `gh pr create` at the tool-call
  level when the verdict file is stale/missing/`FAIL`) is a deliberate
  follow-up, not part of this skill — it needs a `PreToolUse` hook added to
  `.claude/settings.json` via the `update-config` skill, plus its own
  sign-off, since it changes enforced harness behavior rather than just
  adding advisory guidance.
