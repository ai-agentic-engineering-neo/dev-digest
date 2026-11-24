---
name: pr-self-review
description: Pre-PR review of ALL local changes. Matches the project's skills to the diff (every UI skill on client/, onion-architecture on server/), runs one parallel subagent per skill, and writes a PASS/BLOCK verdict that gates `gh pr create` / `gh pr merge`. Run manually with /pr-self-review before opening a PR.
disable-model-invocation: true
---
# PR self-review (workflow)

You are the **orchestrator**. You prepare, fan out to `pr-skill-reviewer` subagents in
parallel, then aggregate. Do not review code yourself except to verify CRITICALs.
Never edit source files, commit or push. The only files you write are under
`.claude/pr-self-review/` (gitignored).

A PreToolUse hook (`.claude/hooks/pr-gate.sh`) blocks `gh pr create|merge` unless
`.claude/pr-self-review/last.json` has `verdict: PASS` AND a `diff_hash` equal to the
current `.claude/skills/pr-self-review/scripts/diff-hash.sh`. So: any edit after this review makes it stale.

## Phase 1 — Prepare
1. `HASH=$(.claude/skills/pr-self-review/scripts/diff-hash.sh)` — compute it FIRST, before reviewing.
2. Build the change set into `.claude/pr-self-review/run/changes.diff`: `git diff main...HEAD`,
   `git diff --cached`, `git diff`, and for each untracked file (`git ls-files --others
   --exclude-standard`) its content as an added file. List changed paths (union of all four).
   Ignore lockfiles, `server/src/db/migrations/**`, generated files, `.claude/pr-self-review/**`.
   No changes → say so and stop (write nothing).
3. Classify paths: `client/**`, `server/**`; everything else (`reviewer-core/`, `e2e/`, docs,
   scripts) gets NO review — say so explicitly.
4. Discover skills: read the frontmatter (`name`, `description`) of every
   `.claude/skills/*/SKILL.md` except `pr-self-review`.
   - **UI skills** = skills whose description is about React / Next.js / frontend UI
     (today: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`,
     `react-testing-library`). A new matching skill is picked up automatically.
   - **Backend architecture skill** = `onion-architecture` ONLY.
   - Every other skill → "not applicable".
5. Task matrix: each UI skill × the changed `client/**` files; `onion-architecture` × the changed
   `server/**` files. A package with no changed files produces no tasks. Shard a package with
   more than 25 files into chunks of 25. At most 8 agents at once; run any extras as a second wave.

## Phase 2 — Fan out (parallel)
Spawn ALL tasks in ONE message: one `Agent` call per task with
`subagent_type: "pr-skill-reviewer"` and a prompt containing `skill:` (path to its
SKILL.md), `files:` (its list), `diff:` (`.claude/pr-self-review/run/changes.diff`).

## Phase 3 — Aggregate
1. Parse each agent's JSON lines (`NONE` = no findings). A failed agent or unparsable output →
   mark that task `ERROR`.
2. Drop findings whose `path:line` is not on a changed line in `changes.diff`.
3. Dedup on `path:line`: keep the highest severity, merge skill names.
4. **Verify every CRITICAL yourself**: open the file at that line and confirm the skill's rule is
   really broken by this diff. Not confirmed → downgrade to WARNING and add "(downgraded: <why>)".
   A false BLOCK costs the user a PR.
5. Verdict: `BLOCK` if ≥1 confirmed CRITICAL **or any task is ERROR** (review incomplete);
   otherwise `PASS`.
6. Write `.claude/pr-self-review/last.json`:
   `{"verdict":"PASS|BLOCK","critical":N,"warnings":N,"diff_hash":"<HASH from step 1>","head":"<git rev-parse HEAD>","at":"<ISO time>","agents":[{"skill":"…","files":N,"status":"ok|error","findings":N}]}`

## Output (print exactly this shape)
```
Skills loaded: <skills actually applied, comma-separated, or "none">
Skills not applicable: <the rest>
Not reviewed: <packages/paths with no matching skill>

CRITICAL
path:line — <skill>: <rule> — fix
WARNING
…
SUGGESTION
…
Verdict: BLOCK (N critical)   |   Verdict: BLOCK (review incomplete: <tasks>)   |   Verdict: PASS
```
Omit empty severity headings. On BLOCK add one line: "Fix the CRITICAL findings and re-run
/pr-self-review — `gh pr create` and `gh pr merge` are blocked until then."
