---
name: pr-self-review
description: Pre-PR self-review router. Scans the branch diff vs origin/main, buckets changed files by package (client/server/reviewer-core/shared), dispatches each bucket to the domain skills that apply (react-*, fastify-*, drizzle-*, onion-architecture, security, zod, typescript-expert), aggregates findings under the project's CRITICAL/WARNING/SUGGESTION enum, and blocks the PR on any CRITICAL. Use before opening a pull request, when asked to "self-review", "pre-flight the PR", "check before I push", or "validate my changes". Trigger terms: PR self review, pre-PR, before PR, self-review, pre-flight, validate changes, check my diff.
---

# pr-self-review

Lightweight pre-PR gate. Reads the pending diff, picks the right domain skills for each file, reviews each file against those skills' rules, and hard-fails on any CRITICAL finding so the PR is never opened with a known blocker.

This skill is a **router**, not a reviewer in its own right. It owns no rules — every finding comes from an existing domain skill in `.claude/skills/`.

## When to use

- Automatically before `gh pr create` or `git push <branch> origin` (wired via the `PreToolUse` hook in `.claude/settings.json`).
- Manually whenever you want a pre-flight: user types `/pr-self-review`, or asks "self-review my diff", "check before I push", "pre-PR review".
- After rebasing or amending commits on a feature branch, when the diff vs `origin/main` has materially changed.

## When NOT to use

- Mid-work exploratory edits that are not yet a PR candidate — this skill is a gate, not continuous review.
- Replacing `/code-review` (heavier, multi-agent) or `/security-review` (dedicated security pass). This skill is intentionally narrower and faster.
- Reviewing files outside the four known packages (`client/`, `server/`, `reviewer-core/`, `e2e/`). Anything else routes to "no skill applicable, skipped".
- Merge-commit noise: if the diff vs `origin/main` includes merge commits from `main`, only review the files actually authored on this branch (use `git log --name-only --no-merges` as a cross-check).

## Severity model

Reuse the project's existing enum verbatim. Do **not** introduce a parallel scheme.

- Source of truth: `server/src/vendor/shared/contracts/findings.ts:11` → `z.enum(['CRITICAL', 'WARNING', 'SUGGESTION'])`.
- CRITICAL definition: lift from `.claude/skills/security/SKILL.md` Severity Classification section — "direct exploit, no auth required" / "direct defect with no workaround".

### What counts as CRITICAL (non-exhaustive)

- Unsanitized user input reaching SQL, shell, or an `exec`-shaped call.
- Missing auth check on a route that reads or mutates another user's data.
- Hardcoded secret, API key, or credential committed to the tree.
- Drizzle migration that drops a `NOT NULL` column without a default on a non-empty table.
- Raw template-string SQL assembled from `req.body` / `req.query` / `req.params`.
- React: `dangerouslySetInnerHTML` fed untrusted input; `useEffect` with no deps causing infinite loop; server-only import crossing into a `'use client'` boundary.
- Fastify: route handler that bypasses the Zod schema; missing error boundary on a top-level plugin.
- Onion-architecture: a route importing a repository directly, or a service reaching into another module's internals.
- Reviewer-core: grounding gate bypassed; `INJECTION_GUARD` removed or weakened.

Everything else grades down to WARNING (clear defect, workaround exists) or SUGGESTION (style, perf, nice-to-have).

## File routing (diff → skills)

Run `git diff --name-only $(git merge-base HEAD origin/main)..HEAD` and bucket each path.

| Path pattern | Skills to apply |
|---|---|
| `client/src/**/*.{ts,tsx}` (non-test) | `react-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert` |
| `client/src/**/*.test.{ts,tsx}` | `react-testing-library` (only) |
| `server/src/modules/**/*.ts` | `fastify-best-practices`, `onion-architecture`, `typescript-expert` |
| `server/src/db/schema/**/*.ts` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/db/migrations/**` | `postgresql-table-design` |
| `server/src/adapters/**/*.ts` | `onion-architecture`, `typescript-expert` |
| `server/src/vendor/shared/**/*.ts` or any `*.schema.ts` | `zod`, `typescript-expert` |
| `reviewer-core/src/**/*.ts` | `typescript-expert` (no local domain skill; note in output) |
| `e2e/**` | skip (flow JSON, not reviewed) |

### Conditional add-ons

- **`security`** is added on top of any bucket when the changed file matches *any* of these heuristics:
  - imports `bcrypt`, `jsonwebtoken`, `jwt`
  - contains `req.body`, `req.query`, `req.params`, `request.body`
  - contains `process.env.` with a value that leaves the file (export, return, template-string interpolation into SQL/HTML)
  - contains `dangerouslySetInnerHTML`
  - contains raw template-string SQL: `` sql`${...}` `` or `` `SELECT ... ${...}` ``
- **`zod`** joins a bucket only when the file imports `zod` **or** lives under `server/src/vendor/shared/contracts/`. Otherwise it stays out to avoid noise on files that don't use it.

### Always excluded

`mermaid-diagram` and `engineering-insights` are authoring/meta skills, never applied in review.

## Workflow

1. **Compute the diff** against `origin/main`:
   ```sh
   BASE=$(git merge-base HEAD origin/main)
   git diff --name-only "$BASE"..HEAD
   ```
   If the branch has never been pushed, `origin/main` is still the right base; fetch if needed.
2. **Short-circuit empty diffs**: if no files changed, print `nothing to review` and exit 0.
3. **Bucket** each file per the routing table above. Render the routing plan to stdout before reviewing, so the user can see which skills fired on which file. Example:
   ```
   Routing plan (3 files, 6 skills):
     client/src/app/agents/[id]/page.tsx
       → react-architecture, react-best-practices, next-best-practices, typescript-expert
     server/src/modules/reviews/service.ts
       → fastify-best-practices, onion-architecture, typescript-expert, security  (heuristic: req.body)
     server/src/db/schema/reviews.ts
       → drizzle-orm-patterns, postgresql-table-design
   ```
4. **Review each (file, skill) pair**. For each pair:
   - Read the file's diff hunks (`git diff "$BASE"..HEAD -- <file>`).
   - Read the skill's `SKILL.md` body (and any sub-files it cites that look relevant to the hunks).
   - Emit findings as `{file, line, severity, skill, rule, message}`. Only report on lines that actually changed — do not score the full file.
5. **Dedupe**. If multiple skills flagged the same `file:line`, keep the highest severity and join the `skill` fields with `+`.
6. **Print the report** (format below).
7. **Exit code**:
   - any CRITICAL → **exit 2** (hook denies the tool call)
   - no CRITICAL → **exit 0** (hook allows the call; warnings and suggestions are advisory)

## Output format (stdout)

```
━━━ pr-self-review ━━━
branch:  <current branch>
base:    origin/main @ <short sha>
changed: <N> files, <M> skills applied
findings: <C> CRITICAL · <W> WARNING · <S> SUGGESTION

── <file-path> ──
  [CRITICAL] <skill>  line <N>
    rule:    <rule name or short id>
    message: <one-line explanation>

  [WARNING]  <skill>  line <N>
    ...

verdict: BLOCKED (1 CRITICAL finding) — resolve before opening the PR
         or
verdict: OK (N warnings, M suggestions) — PR can be opened
```

Keep the report scannable. One entry per finding. No recap paragraph at the end — the verdict line is the summary.

## Non-goals

- Does not wrap `/code-review` or `/security-review`. Those are heavier, cloud-backed passes; this skill is local.
- Does not install husky, add CI jobs, or touch `.github/workflows/`. Enforcement is Claude-Code-harness-local.
- Does not propose fixes. It reports; the author fixes. (Use `/simplify` or `/code-review --fix` separately.)
- Does not store findings. The stdout report is the artifact; nothing is written to disk.
- Does not block merging on GitHub. It blocks *opening* the PR locally. Downstream branch-protection policy is unchanged.

## Related files

- `.claude/settings.json` — the `PreToolUse` hook that gates `gh pr create` and `git push <branch> origin`.
- `.claude/skills/pr-self-review/run.sh` — the hook shim that detects the matching commands and invokes this skill headlessly via `claude -p`.
- `server/src/vendor/shared/contracts/findings.ts` — the source of truth for the severity enum.
- `.claude/skills/security/SKILL.md` — canonical CRITICAL definition (Severity Classification section).
