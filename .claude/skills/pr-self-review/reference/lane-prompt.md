# Lane subagent prompt

Fill the placeholders and send one of these per lane, all in the same turn so
they run in parallel. Keep the subagent read-only.

```
You are reviewing the <PACKAGE> lane of a pull request before it is opened.
Repo root: <ROOT>. Read `<PACKAGE>/AGENTS.md` first, then the "Review checklist"
or rules sections of each skill below, then the diff. Read the full current
file for anything you want to flag; a hunk alone is not enough evidence.

Skills to apply (read each SKILL.md; follow its own review sections):
<one line per skill: path to SKILL.md>

Files in this lane and the skills routed to each:
<route.sh output for this lane>

Diff (base <MERGE_BASE>, mode <MODE>) is in <ROOT>/.git/pr-self-review/lanes/<PACKAGE>.diff.

Severity rules are in <ROOT>/.claude/skills/pr-self-review/reference/severity.md.
Critical is rare and mechanical; most skill-rule violations are warnings.

Write every finding as one JSON object per line to
<ROOT>/.git/pr-self-review/findings/<PACKAGE>.jsonl (create it; an empty file
means no findings). That file is the only thing you may write. Then repeat
the same lines in your reply after the line `FINDINGS:`:
{"severity":"critical|warning|info","rule":"<skill>:<section>","file":"<path>","line":<n>,"summary":"<one sentence>","evidence":"<quote from the file, 1-3 lines>","fix":"<one sentence>"}

Rules for findings:
- One finding per defect. Do not repeat the same rule for every file it hits;
  list the files in `evidence` and use the first as `file`.
- `rule` names the skill and the section heading you applied
  (e.g. "react-frontend-architecture:Placement table", "security:A05 — Injection").
- No finding without a quote from the actual file.
- Skip anything a linter or type checker would catch; precheck already ran them.
- Skip style unless the skill calls it out explicitly.
- If a file has no findings, say nothing about it.

Before `FINDINGS:` write at most five lines of context you think the author
needs (what the change does, where the risk concentrates). Then the findings.
```

## Verification pass prompt

One subagent for all lanes, after the lane reports are in. Build its input
with `scripts/tally.sh list` so the indices match what `tally.sh apply`
expects back:

```
You verify review findings before they can block a pull request. Repo root: <ROOT>.
The findings are in <ROOT>/.git/pr-self-review/findings/to-verify.jsonl, one
JSON per line, each with an `index`. For each one, open the file, re-read the surrounding code, and decide:
CONFIRMED (the defect is real as stated), DOWNGRADED (real but the severity is
too high per <ROOT>/.claude/skills/pr-self-review/reference/severity.md), or
DISMISSED (not reproducible from the code). Precheck findings with
"dismissable": false are CONFIRMED without review; skip them.

Write one JSON per line to <ROOT>/.git/pr-self-review/verdicts.jsonl (the
only file you may write) and repeat them in your reply after `VERDICTS:`:
{"index":<n>,"verdict":"CONFIRMED|DOWNGRADED|UPGRADED|DISMISSED","severity":"<final>","reason":"<one sentence with the evidence>"}

UPGRADED only when the finding meets a row of the critical table; name the row.
```
