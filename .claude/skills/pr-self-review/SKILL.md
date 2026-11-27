---
name: pr-self-review
description: "Pre-PR self-review gate for DevDigest. Collects every change on the branch (commits since merge-base with main + staged + unstaged + untracked), routes each changed file to the project skills that cover it (UI files → frontend-ui-architecture / react / next; backend → onion-architecture / fastify / drizzle / postgres; zod, typescript, security across both), reviews them in parallel, runs typecheck/tests and repo-rule checks, and returns a verdict — any verified CRITICAL blocks opening or merging the PR. Use BEFORE every `gh pr create` / opening a pull request, when the user says 'self-review', 'review my changes', 'ready for PR', 'check before PR', or when the pr-self-review gate hook blocked a command. Also runnable manually: /pr-self-review."
argument-hint: '[--override "<reason>"]'
metadata:
  version: 1.0.0
  updated: 2026-11-27
---

# PR self-review

Reviews the local diff the way the PR will be reviewed, before it exists. One verified
**CRITICAL** in new code ⇒ verdict `fail` ⇒ the PR must not be opened or merged.

Enforcement lives outside this file: `.claude/hooks/pr-self-review-gate.sh` refuses
`gh pr create|ready|merge` without a passing result for the committed state of HEAD, and
posts the `devdigest/self-review` commit status after `git push` (branch protection on
`main` makes that status required — see *Setup*).

`S=.claude/skills/pr-self-review/scripts` — run every command from the repo root.

## Hard rules
- **Never** pass `--override` unless the user typed it in this request, with a reason. Never suggest it as the first remedy — fixing comes first.
- **Never** write to `.devdigest/self-review-ignore.json`. You may show the user a ready entry (finalize prints them); the user adds it.
- **Never** open a PR on `fail`, and never edit result files under `.devdigest/self-review/`.
- Reviewer and verifier agents only read code and write their one output file. You change code only in the fix loop, after the user agreed.

## Steps

1. **Collect** — `node $S/collect.mjs` → `run/manifest.json` (files, changed line ranges, fingerprint).
   If it warns about uncommitted/untracked paths, tell the user: the review covers them, but the gate accepts it only once the committed state equals what was reviewed.
2. **Static checks** — `node $S/checks.mjs --static` (secrets, hand-edited migrations, lockfiles, `@devdigest/shared` drift, `wrapUntrusted()` candidates).
3. **Build checks** — start `node $S/checks.mjs --build` with `run_in_background: true` (typecheck/lint/test per touched package; can take minutes). Don't wait — go on.
4. **Route + budget** — `node $S/route.mjs` → `run/plan.json`. Show the user the printed table (bucket → model → files → cache). If it says `needs_confirmation`, ask before launching agents. If no bucket needs an agent, skip steps 5 and 7 (ground and finalize still run).
5. **Review** — for every bucket with `cached: false`, launch one `Agent` (`subagent_type: general-purpose`, `model` = bucket's model), **all in one message so they run in parallel**. Prompt = `references/reviewer-prompt.md` below the `---`, with placeholders filled from the bucket:
   `{{skill}} {{focus}} {{bucket_id}} {{base_sha}} {{output}}`, `{{files}}` as a bullet list, and `{{extra}}`:
   - security buckets: list `wrap_untrusted_candidates` from `run/checks-static.json` that fall in the bucket's files — *"Root AGENTS.md: any author-controlled text sent to an LLM goes through wrapUntrusted() (reviewer-core/src/prompt.ts). Confirm or dismiss each candidate; a confirmed one is CRITICAL."*
   - otherwise empty.
   Wait for every agent's completion notification. An agent that didn't write valid JSON → re-launch that bucket once.
6. **Ground** — `node $S/ground.mjs`: drops findings whose quote isn't in the file, splits *new* (on changed lines) from *pre-existing* (never blocks), merges duplicates across skills, lists the new CRITICALs that need a verifier.
7. **Verify** — for each `needs_verification` entry launch one `Agent` (`general-purpose`, `model: opus`), in parallel, prompt = `references/verifier-prompt.md` filled from the entry (+ `{{base_sha}}` from the manifest). Wait for all. Also wait for the step-3 background task.
8. **Finalize** — `node $S/finalize.mjs` (append `--override "<reason>"` only per *Hard rules*). It refuses if the worktree changed mid-run — then start again from step 1. Show the user the printed report as-is.
9. **GitHub status** — if HEAD is already pushed: `node $S/post-status.mjs`. Otherwise the hook posts it after the next `git push`.
10. **Outcome**
    - `pass` → the user may open the PR. If there was an override, its reason goes into the PR body.
    - `fail` → state clearly that the PR is blocked and why (CRITICAL ids, or *incomplete*). Offer to fix the CRITICALs. If the user agrees: fix, then re-run from step 1 — caches make the re-run review only the buckets whose files changed and re-test only touched packages.

## Files
| path | what |
|---|---|
| `skill-map.json` | **single source of truth** for routing: glob `include`/`exclude`, optional `contains`, `model`, `focus` per skill; `not_reviewed` lists skills deliberately left out. A new skill in `.claude/skills/README.md` needs an entry here (or in `not_reviewed`). |
| `references/finding-schema.md` | reviewer output schema + severity rubric (from `docs/agent-prompts/general-reviewer.md`) |
| `references/reviewer-prompt.md`, `verifier-prompt.md` | agent prompts |
| `.devdigest/self-review/` (gitignored) | `run/` current run · `cache/` bucket/build/verify caches · `results/<fingerprint>.json` + `latest.json` verdicts |
| `.devdigest/self-review-ignore.json` (committed) | user-owned suppressions: `{fingerprint, skill, file, reason, added_by, expires}` — expired entries stop applying and raise a WARNING |

Results are keyed by a **fingerprint** = sha256(merge-base, git tree of the content), not by commit sha. The worktree's tree is what `git add -A` would stage (untracked included, .gitignore respected). Committing the reviewed changes unchanged gives the same tree, so the review stays valid. Any content change, including an edit to `.devdigest/self-review-ignore.json`, invalidates it; caches make the re-run cheap.

## Setup (once per repo)
- Hooks: `.claude/settings.json` registers the gate; Claude Code asks to trust new project hooks — accept via `/hooks` if prompted.
- GitHub status needs `gh` (authenticated) or a token in `GH_TOKEN`/`GITHUB_TOKEN`/`~/.devdigest/secrets.json` (`GITHUB_TOKEN`, scope `repo:status`).
- Branch protection — makes the status a merge requirement for everyone, including pushes made outside Claude. **Outward-facing: only with the user's explicit OK**:
  ```bash
  gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
  {"required_status_checks":{"strict":false,"contexts":["devdigest/self-review"]},
   "enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}
  JSON
  ```
  (This replaces existing protection settings — read them first with `gh api repos/<owner>/<repo>/branches/main/protection` and merge.)

## Limits
- A commit status can be set by anyone with write access — this is a self-discipline gate, not protection against a malicious collaborator.
- The local gate sees only commands Claude runs; the required GitHub status covers everything else.
- Integration tests (`*.it.test.ts`) run only when Docker is up; otherwise a WARNING says they didn't.
