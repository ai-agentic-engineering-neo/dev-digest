# pr-self-review

**Version:** 1.0.0 · **Updated:** 2026-10-18 · **Scope:** whole repo (client, server, reviewer-core, e2e)

A local review gate that runs before a pull request exists. It reviews every
local change, applies each project skill only to the files that skill owns,
verifies critical findings, and blocks `gh pr create|ready|merge` while any
critical remains. Run it manually with `/pr-self-review`. Claude also triggers
it before opening a PR, and the hook forces it when it hasn't run.

Claude reads `SKILL.md`. This README is the design (the plan) for humans.

## Contents

| File | Purpose | Loaded by Claude |
|---|---|---|
| [SKILL.md](SKILL.md) | Orchestration: steps, flags, how to talk about the verdict | when the skill triggers |
| [routing.json](routing.json) | Glob → skill routes, excludes, precedence, scope defaults | read by scripts |
| [references/severity.md](references/severity.md) | Shared severity scale + mapping of every skill's own scale | by each reviewer |
| [references/reviewer-prompt.md](references/reviewer-prompt.md) | Prompt template, one subagent per (skill, file group) | when spawning reviewers |
| [references/verifier-prompt.md](references/verifier-prompt.md) | Adversarial prompt that tries to refute a critical | when spawning verifiers |
| [references/guard-integrity.md](references/guard-integrity.md) | Built-in reviewer for INJECTION_GUARD + grounding gate | as a reviewer "skill" |
| [suppressions.json](suppressions.json) | Repo-wide false-positive suppressions (non-critical only) | read by scripts |
| `scripts/prepare.mjs` | Collect changes, fingerprint, route, chunk, cache lookup | step 1 |
| `scripts/checks.mjs` | Project rules + typecheck / arch:check (/ tests) | step 2 |
| `scripts/finalize.mjs` | Grounding, new-only filter, verification, dedup, waivers, cache, verdict, report | steps 4–5 |
| `scripts/gate.mjs` | PreToolUse hook / `--cli` gate, reads the verdict only | hook |
| `scripts/post-status.mjs` | Optional GitHub commit status `devdigest/self-review` | `--post-status` |
| `scripts/selftest.mjs` | Regression test of all deterministic behaviour (no LLM) | maintenance |

## Pipeline

```
prepare ──► checks ──► reviewers (parallel, 1 per skill-group) ──► finalize --stage candidates
                                                                        │
                                verifiers (parallel, 1 per critical) ◄──┘
                                                                        │
                                                         finalize ──► verdict ──► gate hook
```

1. **Collect.** Diff against `merge-base(origin/main, HEAD)`, covering
   committed, staged, unstaged and untracked files (respecting `.gitignore`).
   Renames count as delete + add.
2. **Fingerprint.** A hash of the merge-base plus `(path, content hash)` for
   every changed file. Committing reviewed work keeps it. Any edit or a new
   base invalidates it, so the gate can never accept a stale review.
3. **Route.** Each reviewable file is matched against `routing.json`.
   - Client files go to the frontend skills, server files to onion / fastify /
     drizzle / postgres, contracts to zod.
   - security covers server, reviewer-core, the API gateway, workflows and
     `package.json`.
   - reviewer-core's guard files also go to the built-in `@guard-integrity`
     reviewer.
   - Code that no route claims falls back to `typescript-expert`.
   - Lockfiles, generated migrations and binaries are excluded from LLM
     review (migrations still have a deterministic rule).
   - Skills that exist in `.claude/skills/` but aren't routed produce a
     warning. If the catalog gives them a scope, they get that scope's
     default globs, so a new skill is never silently ignored.
4. **Deterministic checks.** Rules from root `CLAUDE.md`, enforced as
   critical with no LLM involved:
   - migration changed without a schema change;
   - contract changed in only one of the two `vendor/shared` copies;
   - key-shaped secret or a `.env` added;
   - `INJECTION_GUARD` usage removed.

   Plus `typecheck` for every touched package and `arch:check` for server.
   `--with-tests` adds unit tests.
5. **Review.** One clean-context subagent per (skill, ≤40-file group). It reads
   only its own skill, its own diff and the module's `CLAUDE.md` /
   `INSIGHTS.md`, and writes JSON findings.
6. **Ground + new-only.** See improvements 1 and 2 below.
7. **Verify.** Each fresh critical gets an adversarial verifier that tries
   to refute it. Refuted → major. Unverified → stays critical (fail-safe).
8. **Verdict.** `block` if any unwaived critical, any reviewer without output,
   or checks didn't run. Otherwise `pass`. `--quick` gives `quick-pass`, which
   never unlocks the gate.

## Severity

One scale: critical / major / minor / nit, plus `info` for pre-existing issues.
**Critical means introduced by this diff** and either a demonstrable bug, a
traced vulnerability, a breach of a root-`CLAUDE.md` rule, or a new
dependency-direction violation. The full mapping of each skill's own scale is
in [references/severity.md](references/severity.md).

## Improvements built in (beyond the first plan)

1. **Only new problems block.** A finding on a line the diff didn't change is
   downgraded to `info` ("pre-existing in a touched file"). Without this, every
   PR touching an old file would be blocked by legacy issues, and people
   would stop using the gate.
2. **Grounding.** Every finding must quote the code verbatim (`evidence`).
   `finalize` searches the current file, or the removed side of the diff for
   `"side":"removed"`. A finding whose quote isn't there is dropped and listed
   under *Filtered out*. One that points at the wrong line is re-anchored to
   the real one. This is the same idea as reviewer-core's grounding gate,
   applied to our own reviewers.
3. **Incremental re-runs.** Results are cached per
   `(skill, skill-file hash + prompt/severity hash, path, file diff hash)` in
   `.git/devdigest-self-review/cache/`. After fixing one critical, only the
   edited files are reviewed again. Editing a skill or the reviewer prompt
   invalidates its cache automatically.
4. **Skill precedence.** `routing.json → precedence` decides which finding is
   primary when several skills report the same `file:line`. The others are
   kept as "also reported by". It also settles known conflicts, e.g.
   `react-best-practices` vs `frontend-ui-architecture`
   (`docs/improvement-plan.md` Q12).
5. **Suppressions for false positives.** Two ways, for non-critical findings
   only:
   - inline `// self-review-ignore <rule-id|skill|*>` on the line or up to two
     lines above;
   - `suppressions.json` entries with a reason and expiry.

   Criticals can only be waived per run.
6. **PR body section.** `pr-body-section.md` records the verdict, reviewers,
   checks, waived criticals and open majors.

## Decisions taken (defaults — change here if the team disagrees)

| Question | Decision |
|---|---|
| Escape hatch for a critical? | Yes. `--waive <id>="reason"` (≥10 chars), and only with the reason the user gave themselves. It is recorded in the verdict and the PR body. Claude never waives on its own. |
| Publish to GitHub? | Opt-in `--post-status`. It sets commit status `devdigest/self-review` on HEAD and refuses if the working tree is dirty. To make it actually block merges, add it as a required check in `main` branch protection. |
| Run tests? | Off by default (typecheck + arch:check only). `--with-tests` adds unit tests. |
| Checklist items | major by default. critical only for dependency direction, contracts and project rules. |
| `git push` | Not gated. Pushing WIP is fine; opening, readying or merging a PR is what's gated. |

## Enforcement layers

1. **Claude Code hook** (enabled): `.claude/settings.json` → PreToolUse on Bash
   → `scripts/gate.mjs`.
   - It reacts only to `gh pr create|ready|merge`, honours `--base`/`-B`, and
     exits 2 with the reason.
   - It costs one `git diff --name-status` + file hashes, with no LLM.
   - `gh pr merge <n>` is judged by the *current branch's* verdict, so merging
     someone else's PR from your branch needs layer 3.
2. **git pre-push** (opt-in, works outside Claude):
   ```bash
   mkdir -p .githooks && printf '#!/bin/sh\nexec node .claude/skills/pr-self-review/scripts/gate.mjs --cli\n' > .githooks/pre-push
   chmod +x .githooks/pre-push && git config core.hooksPath .githooks
   ```
   This blocks every push without a passing review, which is stricter than
   layer 1, so enable it only if the team wants that.
3. **GitHub required check** (opt-in): `--post-status` + branch protection.
   The status is set from a developer machine, so it rests on trust. The
   fully enforced version is running this review in CI, a natural fit for the
   future agent-runner lesson.

## Maintaining

- **New skill in `.claude/skills/`:** add a route to `routing.json` or list it
  in `notReviewers`. Until then `prepare` warns on every run.
- **Changed scripts:** run `node .claude/skills/pr-self-review/scripts/selftest.mjs`.
  It covers 31 scenarios: routing, gate, grounding, cache, waivers and project
  rules.
- **State** lives in `.git/devdigest-self-review/{runs,verdicts,cache}`. It is
  never committed and safe to delete.

## Later (not built yet)

`--fix` mode for major/minor findings, a "new use case without a test" check,
per-skill noise metrics (findings vs. suppressions), and replacing the
subagents with DevDigest's own `reviewer-core` once the agent-runner exists.
