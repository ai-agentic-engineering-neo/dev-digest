---
name: pr-self-review
version: 1.0.0
description: >-
  Reviews the committed branch diff before it leaves the machine: routes each
  changed file at the skills that govern it, reviews each slice against those
  rules, and blocks `git push` / `gh pr create` while any CRITICAL finding
  stands. Use before opening a pull request, before pushing a branch, when the
  user asks to "open a PR", "create a PR", "push this", "review my changes
  before the PR", or when a PreToolUse denial mentions PR Self Review. Also use
  when the user asks "перевір зміни перед PR", "зроби самоперевірку",
  "відкрий пулл-реквест", "запуш зміни", or invokes `/pr-self-review`.
---

# PR Self Review

A pre-PR gate. It answers one question: **would this branch survive review by the
rules this repo already wrote down?**

The rules are not new. They live in `.claude/skills/` and in
`docs/agent-prompts/`, and until now nothing ever applied them to a diff. This
skill routes a diff at them and turns the result into a blocking decision.

**Scope: the committed branch only** — `git diff <merge-base> HEAD`. Uncommitted
work is deliberately *not* reviewed, because that is not what a PR contains. It
*is* reported, so coverage is never silently partial.

**Vocabulary is borrowed, not invented.** Severities (`CRITICAL`/`WARNING`/
`SUGGESTION`), the blocking rule (`gateTriggered`, fail on ≥1 CRITICAL), the score
math and the output markdown all come from the product itself — see
`reviewer-core/src/output/to-review.ts` and `src/review/reduce.ts`. Do not invent a
parallel scale.

## Modes

| Invocation | What runs | Cost |
|---|---|---|
| `/pr-self-review` | everything below | see below — expect ~100k tokens **per group** |
| `/pr-self-review --fast` | steps 1, 2, 3 and 7 only — no sub-agents, no LLM | ~2 s |
| `/pr-self-review --dispute <id> "<argument>"` | re-runs the verifier on one finding | one agent |
| `/pr-self-review --waive <id> "<reason>"` | records a waiver (§Overrides) | none |

`--fast` writes `"mode": "fast"`, and **the hook rejects a fast report**. It is for
your own edit loop, never for the gate.

---

## 1. Scope

```bash
BASE=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'); BASE=${BASE:-main}
MB=$(git merge-base "$BASE" HEAD)
git rev-parse HEAD                      # head_sha
git diff --name-status -M "$MB" HEAD    # the change, with rename detection
git status --porcelain                  # coverage warning only — never reviewed
```

`symbolic-ref`, not `rev-parse --abbrev-ref`: without an `origin/HEAD` (a repo that
was `git init`ed and pushed rather than cloned) the latter still prints
`origin/HEAD`, `BASE` becomes `HEAD`, and every run finds nothing to review.

If `HEAD` equals `$MB` there is nothing to review — say so and stop. If the
worktree is dirty, print a prominent warning naming the uncommitted files and
record them in `dirty_at_generation`. **Never review them.**

## 2. Route

Apply [routing.md](routing.md). Every changed path must land in exactly one of
`changed_files` (with a group), `excluded_files` (with a reason), or
`unrouted_files` (which go to group F). Nothing is silently dropped.

## 3. Deterministic checks — free, always run

Also specified in [routing.md](routing.md):

- **Routing drift guard** — a directory under `.claude/skills/` that is neither
  routed nor explicitly excluded becomes a WARNING. A new skill must never
  silently never-run.
- **Vendored-contract twin check** — `@devdigest/shared` is vendored in *both*
  `server/src/vendor/shared` and `client/src/vendor/shared` and `AGENTS.md`
  requires them to change together. A one-sided edit is a synthetic **CRITICAL**
  (`source_skill: "AGENTS.md"`, `source_rule: "Cross-package invariants"`).
- **The greps** — [greps.md](greps.md), run at two revisions and subtracted.

## 4. Spawn reviewers

One `Agent` (`general-purpose`) per active group, **all in one message, at most 3
at a time**. A group with no matching files is not spawned.

Give each agent file *paths to read*, never inlined skill text — that keeps this
orchestrator's context small and lets the agent follow a skill's own links when a
call is contested:

```
Read these skill files in full before anything else:
  <abs>/.claude/skills/onion-architecture/SKILL.md
  <abs>/.claude/skills/fastify-best-practices/SKILL.md

Your diff, and nothing else:
  git diff -U10 <MB> HEAD -- <this group's files>

ADDED by this change (rules are MANDATORY here):
  <paths with status A>
MODIFIED by this change (rules are ADVISORY — cap at WARNING):
  <paths with status M>

<the full body of reviewer-prompt.md>
```

`-U10`, not the default `-U3`: an architecture reviewer needs surrounding code to
tell a layer violation from a correct call.

**Cost — measured, not estimated.** The first full run, on an 85-file branch,
spawned six groups and cost **~660k sub-agent tokens** over **~10 minutes** wall
clock at 3-way concurrency. Per group it ranged 76k–137k tokens and 1.5–9 minutes.
Cost tracks how much *surrounding* code a reviewer must read to judge its slice,
not the size of the slice: the 5-file `security` group cost 76k, the 41-file
`generic` group 129k. Budget **~100k tokens per active group** — roughly 200k for
a backend-only change, 600k for a full-stack one.

That is expensive, and it is the reason for three decisions above: `--fast` exists
so the edit loop never pays it, re-runs are incremental, and **the hook only ever
validates an artifact — it never generates one.** A gate that ran this on every
push would be switched off within a day.

**Large diffs.** Above ~120 files or ~4000 diff lines in one group, do not fan out
further — chunk that group's diff and reduce, the way `sliceDiff` and the
`map-reduce` strategy already do in `reviewer-core/src/review/`. Never silently
truncate; if a group was chunked, say so in the report.

**Re-runs are incremental.** If a report already exists for this branch, hash each
group's `(sorted paths + blob shas)` into `group_digest` and **re-spawn only the
groups whose digest moved**. Carry the rest of the findings forward, then re-ground
them (step 5) against the new diff so a finding whose lines vanished is dropped
rather than resurrected stale.

## 5. Ground — deterministic, free

Mirror `reviewer-core/src/grounding.ts`. Drop a finding when:

- `file` is not in the changed-file list, or
- `[start_line, end_line]` does not intersect a new-side hunk for that file, or
- `diff_evidence` does not appear as a `+` line in the diff (compare with
  whitespace normalised).

Downgrade `CRITICAL` → `WARNING` when `confidence < 0.8` (do not drop it).

**Deduplicate on `(file, overlapping line range, same category)`.** Keep the
highest severity, then the highest confidence; merge the rationales rather than
dropping the second outright, and record the merge in `dropped[]`.

All three parts are load-bearing, and the first real run proved each one:

- **Not `(file, source_rule)`** — two groups routinely describe the *same* defect
  through different rule books. `backend-data` and `backend-architecture` both
  flagged `trace.ts:65-66` (`RunStats.cost_usd` required on a schema describing
  already-persisted documents), citing `zod §5.2` and `onion-architecture §8`. A
  rule-keyed dedupe lets that pair straight through.
- **Category is what stops the overlap rule overcorrecting.** Line overlap alone
  merged two genuinely different `schema/runs.ts` findings — a money column typed
  `double precision` (`bug`, lines 21-22) and a missing FK index (`perf`, lines
  8-33, a range that simply swallows the other). Identical `diff_evidence` too, so
  evidence-matching would not have saved it. Differing categories did.

Deterministic dedupe cannot do semantics. When ranges overlap but categories
differ, keep both and note them as related — never drop silently.

**Every drop is recorded in `dropped[]` with a reason.** A gate you cannot debug
gets switched off.

## 6. Verify CRITICALs — only if there are any

If ≥1 CRITICAL survives step 5, spawn exactly **one** agent with
[verifier-prompt.md](verifier-prompt.md). Zero CRITICALs → skip it entirely, which
is the common case and costs nothing.

Apply its verdicts: `uphold` keeps the finding, `downgrade` sets
`verified: "downgraded"` and severity `WARNING`, `drop` moves it to `dropped[]`.
All three are written to the report — a suppressed finding is never invisible.

## 7. Reduce, write, report

Score with the repo's own constants (`reviewer-core/src/review/reduce.ts`):
`CRITICAL 35, WARNING 12, SUGGESTION 3`, `score = clamp(100 − Σ, 0, 100)`. The gate
fails iff ≥1 CRITICAL remains.

Write `$(git rev-parse --absolute-git-dir)/devdigest/pr-self-review.json` — use
`rev-parse`, never a literal `.git/`, so worktrees work — with:

```
schema_version: 1 · mode: "full"|"fast" · generated_at · branch · base_ref
merge_base · head_sha · diff_digest · skills_digest · dirty_at_generation[]
changed_files[{path,status,group}] · excluded_files[{path,reason}] · unrouted_files[]
groups_run[{name,skills,files,group_digest,chunked}] · greps[] · findings[] · dropped[]
counts{CRITICAL,WARNING,SUGGESTION} · score · fail_on:"critical" · verdict · gate
```

`skills_digest` must come from the hook so the two can never disagree:

```bash
node .claude/hooks/pr-self-review-gate.mjs --digest
```

Write the human-readable sibling `pr-self-review.md` and **print it**, in the exact
format `composeBody()` emits in `reviewer-core/src/output/to-review.ts`:

```
## PR Self Review — Changes requested

**3 findings** · 1 critical · 1 warning · 1 suggestion

- 🔴 **Title** (critical, bug) — `file.ts:41-43`
  - rationale
  - _Suggestion:_ …
```

Header is `— Approved ✅` when there are no findings, `— Changes requested` when the
gate fails, bare otherwise. Emoji: CRITICAL 🔴, WARNING 🟡, SUGGESTION 🔵. Do not
invent formatting — a self-review must look exactly like the product's own review.

## 8. Close the loop

Every waiver, dispute-downgrade and verifier `drop` is appended to
[suppressions.md](suppressions.md). Before finishing, count entries per
`source_rule`: **at 3 or more, propose a concrete fix** — add the case to
`onion-architecture` §11, tighten a grep, narrow a rule to `A`-status files, or
hand the lesson to the `engineering-insights` skill. Propose it; never edit
another skill unprompted.

---

## Overrides

Three tiers, all auditable, all logged to `suppressions.md`.

1. **Waive one finding.** Write
   `<git-dir>/devdigest/pr-self-review.override.json`:
   `{ head_sha, waived: [{ finding_id, reason, waived_by, waived_at }] }`.
   Honoured only when `head_sha` matches current HEAD (**waivers do not survive a
   new commit**), the id exists, and `reason` is ≥40 characters. Print a
   paste-ready `PR-Self-Review-Waiver: <id> — <reason>` trailer for the PR
   description, since `.git/` never leaves the machine.
2. **Dispute.** `--dispute <id> "<argument>"` re-runs only the verifier with the
   argument appended. The honest path when the *review* is wrong rather than the
   rule inapplicable.
3. **Break glass.** `PR_SELF_REVIEW_BYPASS=1 git push` — allowed, and loudly
   announced in the transcript.

## What this gate cannot do

`PreToolUse` fires only on Claude Code's `Bash` tool. A push from a terminal, the
VSCode Git panel, GitHub Desktop, or "Create pull request" on github.com never
reaches it. **This is a self-discipline aid for the agent-driven workflow, not
enforcement.** Real enforcement is a required GitHub check. Say so plainly when a
user asks whether this makes a merge impossible — it does not.
