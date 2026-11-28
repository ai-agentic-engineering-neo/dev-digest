---
name: pr-self-review
disable-model-invocation: true
description: Use when about to open or merge a pull request - before `gh pr create` or `gh pr merge`, on "open a PR", "ship it", "ready for review" or /ship; when the hook refuses one of those commands for lack of a pr-self-review verdict; or when asked to self-review, pre-review or check the branch's changes against the project skills before a PR. Also when adding a skill that should take part in that review.
---

# PR self-review

**The verdict comes from `scripts/verdict.mjs`, not from you.** Reviewers find
problems, you check the critical ones against the code, and the script decides
whether the PR may be opened. A PR is opened or merged only on `PASS` or
`PASS_WITH_WARNINGS` for the code as it is now.

Which skill reviews which file: [routing.json](routing.json). What may be
rated `CRITICAL`: [criticals.md](criticals.md). What a reviewer is told:
[reviewer-prompt.md](reviewer-prompt.md).

All commands run from the repo root; `S` is `.claude/skills/pr-self-review/scripts`.

## Steps

1. **Collect.** `node $S/collect.mjs` (add `--base <ref>` when the PR targets
   a branch other than `main`). It compares the working tree with the
   merge-base: commits, staged, unstaged and untracked files. Its JSON lists
   the review `groups`, the `mechanical` findings it already made, and
   `problems`. `changedFiles: 0` means there is nothing to review: say so and
   stop.
2. **Review.** For every group with `"cached": false`, start a fresh subagent
   with this message and nothing about your own view of the code:

   ```
   Follow <repo root>/.claude/skills/pr-self-review/reviewer-prompt.md.
   Repo root: <repo root>
   Your group: <that group's JSON object from collect.mjs>
   ```

   Start all groups in one message so they run together. A group with more
   than 40 files is split between several reviewers, each given the same
   object with part of the files, and their findings are joined into one
   list. Do not review a group in this session when a subagent tool exists:
   this session wrote the code.
3. **Verify every `CRITICAL`.** Open the cited file at the cited line. The
   finding stands when the line says what the finding claims and the rule's
   condition in `criticals.md` is met. Then add `"verified": true`. Otherwise
   move it out of `findings` into `dismissed` with the reason. A critical is
   never rewritten as a `WARNING`.
4. **Record.** Write each group's result to a file in the scratchpad and run
   `node $S/verdict.mjs record <group-id> <file>`:

   ```json
   {
     "findings": [{ "severity": "CRITICAL", "rule": "…", "file": "…", "line": 42, "title": "…", "why": "…", "fix": "…", "evidence": "…", "verified": true }],
     "dismissed": [{ "rule": "…", "file": "…", "line": 7, "reason": "the handler only constructs the repository" }]
   }
   ```

5. **Finalize.** `node $S/verdict.mjs finalize` prints the report and writes
   the verdict. Give the user the report: the verdict line first, then every
   critical with its `file:line` and fix, then the rest in short.
6. **Act on the verdict.**

| Verdict | Do |
|---|---|
| `PASS`, `PASS_WITH_WARNINGS` | The PR may be opened. Name the warnings that remain. |
| `BLOCKED` | Do not open or merge. Offer to fix the criticals. After a fix, start again at step 1; groups whose files did not change come back `"cached": true` and are not reviewed again. |
| `INCOMPLETE` | Finish what the report names (a reviewer that did not return, an unverified critical, a check that could not run), then finalize again. It blocks exactly like `BLOCKED`. |

Uncommitted changes are reviewed too, and the report lists them: they are not
part of the PR until committed.

## What the script decides

| Case | Outcome |
|---|---|
| A finding with no file in the change, no line, no rule id or no title | rejected and listed |
| `CRITICAL` under a rule id that is not in `criticals.md` | becomes a `WARNING` |
| `CRITICAL` on lines this branch did not add or change | becomes a `WARNING`, marked pre-existing |
| `CRITICAL` without `"verified": true` and `evidence` | verdict `INCOMPLETE` |
| A group with nothing recorded | verdict `INCOMPLETE` |
| The same file, line and rule from two groups | one finding, the higher severity |
| A `pr-self-review-ignore` comment with a reason on that line | listed as suppressed, does not block |
| Any file content changed after the verdict | no verdict: run the skill again |

Report what the reviewers found and let these rules sort it. Do not pre-filter
findings to reach a verdict.

## Suppressing a finding

A finding the user accepts stays in the code, visible to the human reviewer,
on the cited line or the line above it:

```ts
// pr-self-review-ignore: onion/query-in-route — bootstrap script, runs before the container exists
```

The rule id must match and the reason is required. Add this comment only when
the user tells you to, with their reason. The script-run checks other than the
secret scan cannot be suppressed.

## The hook

`.claude/settings.json` runs `$S/gate.mjs` before every Bash command. It
refuses `gh pr create` and `gh pr merge` unless the current content has a
passing verdict. When it refuses, run this skill. It matches the text of the
command, so a command that only mentions those words (an `echo`, a test
payload for `gate.mjs`) is refused too while there is no passing verdict. Opening the PR another way
(`gh api`, a browser URL, asking the user to type the command) is the same PR
without the review.

## Excuses that are not exceptions

| Excuse | Reality |
|---|---|
| "The user said it is urgent, just open it" | The user set this gate up. Tell them the verdict and the criticals; they choose between a fix and a suppression with a reason. |
| "This critical is a false positive" | Then it fails verification: move it to `dismissed` with the reason, where the report shows it. Dropping it silently is not verification. |
| "It is a small diff, I can review it myself" | You wrote it. The reviewer has not seen your reasoning, which is the point. |
| "Six reviewers passed, one timed out" | `INCOMPLETE`. Run that one again. |
| "The finding is in old code" | The script knows which lines are new. Record the finding as reported. |
| "A draft PR is not really a PR" | `gh pr create --draft` is `gh pr create`. |
| "`deps:validate` is slow, I'll pass `--no-deps`" | That run ends `INCOMPLETE` when backend files changed. |
| "I'll write the verdict file myself" | Files in `.git/pr-self-review/` are written by the scripts only. |
| "I'll lower it to a warning so it passes" | Severity is the reviewer's call and the script's rules, not a setting. |

## Adding a skill to the review

`collect.mjs` reports a skill directory it does not know under
`unroutedSkills`. Add a lens for it to a group in `routing.json` (or name it in
`notReviewSkills`), add its section to `criticals.md` with at most five rules
that meet the bar stated there, and run the tests:

```sh
node --test ".claude/skills/pr-self-review/scripts/*.test.mjs"
```
