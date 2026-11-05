# Merge-gate — why my push / PR was blocked

The gate (`scripts/gate.mjs`) lets code leave the machine only when the last `pr-self-review` is
**PASS for exactly the current diff**. It reads `.claude/pr-self-review/last-run.json`.

## Where it runs

| Hook | Wired in | Catches |
|---|---|---|
| Claude Code `PreToolUse` (`--claude-hook`) | `.claude/settings.json`, matcher `Bash\|PowerShell` | commands Claude runs: `git push`, `git -C dir push`, `gh pr create`, `gh pr merge` — also inside chains (`a && b`, `;`, `\|`) and quotes (`bash -c "git push"`) |
| git `pre-push` (`--git-hook`) | `.githooks/pre-push`, enabled once per clone: `git config core.hooksPath .githooks` | every `git push` from any terminal / IDE |
| manual | `node .claude/skills/pr-self-review/scripts/gate.mjs` | prints `gate open` / `gate closed` + reason |

## When it is closed

| Message | Meaning | What to do |
|---|---|---|
| `no pr-self-review result yet` | never reviewed on this clone | run `/pr-self-review` |
| `the last review … is stale` | the diff (working tree vs merge-base + untracked files) changed after the review — any edit, new file or waiver | re-run `/pr-self-review`; unchanged files come from the cache, so it is cheap |
| `last review is BLOCK (n critical)` | confirmed critical findings remain | fix them, or — only for a real false positive — the **user** adds a waiver ([waivers.md](waivers.md)) |
| `review incomplete` | a skill agent produced no output | re-run `/pr-self-review` |

Committing does **not** make a result stale (the hash compares the working tree with the merge-base,
not HEAD), so the usual flow is: review → commit → push. This also holds for **new (untracked)**
files: the hash is taken from a throwaway index with everything `git add -A`-ed, so a new file
hashes exactly as it will once committed (`scripts/lib.mjs` → `computeDiffHash`; eval
"committing a NEW (untracked) file keeps a PASS fresh").

## Always allowed

- Commands that don't publish code (`git status`, `git commit`, `gh pr view`, …).
- A push that only deletes remote branches (`git push origin --delete x`, `git push origin :x :y`).
  A push that updates **and** deletes (`git push origin feat :old`) is gated.
- No changes vs the base (`origin/main`) — nothing to review.

## Bypass and limits

- The only bypass is a human's deliberate `git push --no-verify` (skips `pre-push`). There is no
  env-var bypass, and Claude must never bypass the gate or edit the hooks to get through.
- The gate is **local**. It cannot disable the Merge button on GitHub — that would need a required
  status check in branch protection, and CI cannot run this skill without a Claude API key.
- The Claude hook matches command text; an obfuscated command (variables, scripts that call git
  internally) can slip past it — the git `pre-push` hook is the backstop for pushes, not for `gh pr`.
