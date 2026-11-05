---
name: pr-self-review
description: >-
  Pre-PR self review of ALL local changes in DevDigest (branch commits vs origin/main + staged +
  unstaged + untracked). Routes every changed file to the repo skills that cover it (UI skills on
  client/ files, onion/fastify/drizzle on server/ files, security everywhere…), runs them as parallel
  subagents plus deterministic checks (Do-not-touch policy, dependency-cruiser layers, tsc, server tests
  after reviewer-core changes), and BLOCKS push / PR / merge if any confirmed critical finding remains.
  Use before every `git push`, `gh pr create`, `gh pr merge` or compare-URL PR, whenever the gate hook
  says "no pr-self-review result" or "stale", and on "/pr-self-review", "self review", "review my
  changes before PR", "перевір зміни перед PR", "самоперевірка", "чи можна відкривати PR".
---

# PR self review

Goal: nothing with a confirmed **critical** finding leaves the machine. The verdict is written to
`.claude/pr-self-review/last-run.json`; the gate (`scripts/gate.mjs`, wired as a Claude Code
`PreToolUse` hook and a git `pre-push` hook) refuses push / PR create / PR merge unless that verdict is
**PASS for exactly the current diff**.

Flags (pass through to `collect-diff.mjs`): `--base <ref>` (default `origin/main` — this repo is a
fork, its own `main` is the base), `--no-cache` (full re-review).

## Workflow

Run every script from the repo root with `node`; `S = .claude/skills/pr-self-review/scripts`.

1. **Collect & route** — `node S/collect-diff.mjs [--base …] [--no-cache]`.
   Prints the routing table and writes `.claude/pr-self-review/run/plan.json` with `tasks[]` (one per
   skill, or up to 3 chunks for big skills). Pairs whose file + skill + insights + rubric are
   unchanged come from the cache (`cached[]`) and get no agent.
   - "no changes" → report PASS and stop (still run step 5 so the gate gets a result).
   - Show the `WARN` lines to the user (missing / unrouted skills).
2. **In ONE message, start in parallel:**
   - `node S/checks.mjs` via Bash with `run_in_background: true` (policy, layer check, tsc, tests —
     can take minutes).
   - one `Agent` (`subagent_type: "general-purpose"`) per entry of `plan.tasks`, using the
     **Reviewer prompt** from [references/finding-schema.md](references/finding-schema.md) filled with
     that task's `skillPath`, `insights`, `slicePath`, `files`, `outputPath`. Each agent gets only its
     own slice — never paste the whole diff into a prompt.
3. When all agents and `checks.mjs` are done: `node S/finalize.mjs merge`.
   It validates and dedupes findings, recomputes "on a changed line" from the diff, marks the rest
   `pre-existing`, and prints the ids in `needsVerification`. If it lists **INCOMPLETE** tasks, re-run
   just those agents once, then `merge` again.
4. **Verify criticals** — for every id in `needsVerification`, in ONE message, one `Agent` with the
   **Verifier prompt** (same file). It gets the claim and the location, not the first agent's
   reasoning. Unconfirmed → downgraded to `high`; not on a changed line → `pre-existing`.
5. `node S/finalize.mjs verdict` — applies verification + waivers, writes `last-run.json`,
   `pr-summary.md`, refreshes the cache, prints the report. Exit 1 = BLOCK.
6. **Report to the user** (in their language), concisely:
   - verdict first; then every blocking critical as `file:line · rule · issue · fix`;
   - counts of high/medium/low and anything waived or skipped (`WARN typecheck skipped …`);
   - on PASS: point to `.claude/pr-self-review/pr-summary.md` (paste into the PR description);
   - on BLOCK: offer to fix the criticals; after fixes, re-run the skill (cache makes it cheap).
     If the user calls a critical a false positive, show the waiver entry the report printed and let
     **them** add it — see [references/waivers.md](references/waivers.md).

## Hard rules

- Never write or edit `.claude/pr-self-review/waivers.json` yourself, never edit `last-run.json`, and
  never weaken `routing.json` / the rubric to get a PASS.
- Never bypass the gate (`--no-verify`, `git -c core.hooksPath=…`, editing settings) — that is the
  user's call, and only theirs.
- Severity comes from [references/severity-rubric.md](references/severity-rubric.md); a violated
  `<pkg>/INSIGHTS.md` entry is at least `high`.
- Do not "fix while reviewing": the review run only reads code and writes under
  `.claude/pr-self-review/`.

## Files

| Path | Role |
|---|---|
| `scripts/collect-diff.mjs` | diff, routing, cache lookup, task slices → `run/plan.json` |
| `scripts/checks.mjs` | deterministic checks → `run/checks.json` |
| `scripts/finalize.mjs` | `merge` → `run/merged.json`; `verdict` → `last-run.json`, `pr-summary.md`, cache |
| `scripts/gate.mjs` | merge-gate (`--claude-hook`, `--git-hook`, or manual status) |
| `references/routing.json` / `routing.md` | which skill reviews which file |
| `references/severity-rubric.md` | the single severity scale |
| `references/finding-schema.md` | finding JSON + reviewer/verifier prompts |
| `references/waivers.md` | waiver format and limits |
| `references/gate.md` | when the gate blocks, what it catches, bypass and limits |
| `evals/` | `run-deterministic.mjs` (scripts, no LLM) + LLM cases |

State lives in `.claude/pr-self-review/` (gitignored, except the committed `waivers.json`).
