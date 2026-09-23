---
name: pr-self-review
description: "Workflow skill (dispatcher): reviews every change on the branch before a PR is opened. Routes the changed files to the repo's other skills with a deterministic table (routing.json), runs the cheap deterministic gates (typecheck, lint, arch:check, shared-contract drift, missing migration, secret scan), verifies every CRITICAL finding, and returns a PASS/BLOCK verdict with a report. Use when the user asks for /pr-self-review, a self-review, a pre-PR review, or 'review my branch/diff before I push'. Invoked manually — nothing runs it automatically."
metadata:
  version: "1.0.0"
  type: "workflow"
  scope: "whole repo (client/, server/, reviewer-core/, e2e/)"
allowed-tools: Bash(python3 .claude/skills/pr-self-review/scripts/collect.py *), Bash(python3 .claude/skills/pr-self-review/scripts/test_collect.py), Agent, Read, Grep, Glob
---

# pr-self-review (workflow)

Local review of everything on the branch before the PR exists. This skill **dispatches
the other skills** — it holds no review rules of its own. It never edits code: it
reports and returns a verdict.

Design and the parts not built yet (cache, verdict publishing, gates as hooks):
[`docs/pr-self-review-plan.md`](../../../docs/pr-self-review-plan.md).

**Invocation is manual only.** `/pr-self-review`, or "self-review my branch". No git
hook and no `PreToolUse` gate runs it (plan §9 is deliberately not installed), so
pushing never triggers a model call behind the user's back. If someone asks for the
auto-gate, point them at the plan — do not install it as a side effect of a review.

```
/pr-self-review [--base <ref>] [--staged-only] [--skill <name>] [--spec <path>] [--tests]
```

## 1. Plan the review (deterministic, no model)

```bash
python3 .claude/skills/pr-self-review/scripts/collect.py [--base <ref>] [--staged-only] [--skill <name>]
```

It returns JSON: `base`, `fingerprint`, `files`, `skills` (skill → files),
`packages`, `gates`, `warnings`, `skipped`. The routing table is
[`routing.json`](routing.json), so the same tree always produces the same plan.
A diff that touches `client/` **and** `server/` therefore pulls **both** skill sets
in one run.

Report `warnings` verbatim — `unrouted skill: <name>` means a skill exists that no
rule can reach, and it would silently review nothing.

## 2. Run the deterministic gates

Only for the packages in the plan. These are cheap, reproducible and never
hallucinate, so they run before any model call. Each failure is **CRITICAL**.

| Gate id | Command | Meaning |
|---|---|---|
| `<pkg>:typecheck` | `cd <pkg> && pnpm typecheck` (`npm` in `reviewer-core`, `e2e`) | must be clean |
| `<pkg>:lint` | `cd <pkg> && pnpm lint` | Biome, linter only — never `--write` |
| `server:arch:check` | `cd server && pnpm arch:check` | no NEW dependency-cruiser violation |
| `repo:check-shared-drift` | `./scripts/check-shared-drift.sh` | the two `@devdigest/shared` copies are identical |
| `server:missing-migration` | inspect `server/src/db/migrations/` | schema changed with no new migration file |
| `repo:secret-scan` | `git diff <base>...HEAD -U0` + regex over ADDED lines | keys, tokens, `.env` values |
| `<pkg>:test:unit` | only with `--tests` | unit tests of the touched packages |

Integration tests are out of scope here: they need Docker.

## 3. Dispatch the review skills (parallel subagents)

One Agent per skill in the plan, launched in parallel in a single message. Each gets:

- the path of that skill's `SKILL.md` — it must read it and apply **only** those rules;
- its file list from the plan, plus the relevant diff hunks
  (`git diff <base>...HEAD -- <files>` and the working-tree diff);
- the `INSIGHTS.md` of every package whose files it reviews (project-specific traps);
- the feature spec when one is in play (`--spec`, a spec changed in the diff, or the
  `NN` in the branch name) — then one extra agent checks the diff against its
  **Acceptance criteria**.

Each agent returns JSON findings: `{skill, file, line, severity, rule, evidence, fix}`.
Split a large file list into batches. Never let an agent edit files.

## 4. Verify every CRITICAL

Each CRITICAL goes to a second agent that checks two things:
(a) the problem is real, (b) the line is part of **this** diff, not old code.
A finding that fails verification drops to HIGH and is marked `unverified`.
Then apply [`accepted.json`](accepted.json) (agreed false positives, matched on
`skill + rule + file + match`); a match becomes `accepted` and stops blocking.
An entry that matches nothing is reported as `stale`. Deterministic gates are never
waived by `accepted.json`.

## 5. Verdict and report

Severity scale: [`reference/severity.md`](reference/severity.md).

- **BLOCK** — at least one verified CRITICAL (or a failed gate).
- **PASS** — otherwise; HIGH/MEDIUM/LOW stay in the report as warnings.

Write `.devdigest/self-review/<fingerprint>.md` (for a human) and `.json` (for tooling),
then answer in chat with: the verdict, counts per severity, every CRITICAL as
`file:line — rule — fix`, and the accepted/stale entries. The fingerprint changes on
any edit, so an old PASS never covers new code.

## Checklist

1. `collect.py` → plan; surface `warnings`.
2. Gates for the touched packages; a failure is CRITICAL.
3. One subagent per routed skill, in parallel, read-only.
4. Verify each CRITICAL; apply `accepted.json`.
5. Report + verdict. Never auto-fix, never push, never install the auto-gate.
