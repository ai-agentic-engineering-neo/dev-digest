# skill-evals

Eval fixtures and run output for testing project skills (`.claude/skills/`)
with the `skill-creator` plugin's with/without or old/new comparison harness.
Lives at the repo root, parallel to `client/`, `server/`, `e2e/` — not inside
each skill's own folder — so fixtures never get pulled into a package's
`tsconfig`/lint/typecheck, and a skill's eval history stays in one place as
the skill evolves.

## Layout

```
skill-evals/
  README.md                      # this file
  <skill-name>/
    evals.json                   # skill-creator's eval definitions (see below)
    fixtures/
      <eval-name>/
        <context files the eval needs — repo/, diff/, conventions.md, ...>
        expected-findings.json   # machine-readable answer key for this fixture
    outputs/                     # gitignored — disposable run output, never committed
      <skill-name>-v-N/
  run-evals.ts                   # TODO — see "Runner" below; not implemented yet
```

## `evals.json`

This is `skill-creator`'s own required input format — its executor/grader/
comparator subagents read this file directly, so its schema is a fixed
external contract, not something this repo can freely redesign. One
`evals.json` per skill, at `skill-evals/<skill-name>/evals.json`:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "name": "short-slug",
      "prompt": "The task to execute, referencing fixture files by path relative to this evals.json (e.g. fixtures/<eval-name>/...)",
      "expected_output": "Human-readable description of success",
      "files": ["fixtures/<eval-name>/some-input.ts"],
      "expectations": ["Verifiable statement 1", "Verifiable statement 2"]
    }
  ]
}
```

File paths inside `evals.json` (`prompt` and `files`) are relative to
`evals.json`'s own directory — i.e. they start with `fixtures/...`, not
`skill-evals/<skill-name>/fixtures/...` and not the old `evals/fixtures/...`.

## `expected-findings.json`

Separate from `evals.json` and not part of `skill-creator`'s schema — this is
this repo's own machine-readable ground truth for a fixture, one per
`fixtures/<eval-name>/` folder. It exists so a future automated runner (see
"Runner" below) can score precision/recall deterministically instead of
relying on an LLM grader's free-text judgement. Keep it a plain JSON list of
planted findings (whatever fields the fixture needs — line, rule/convention
name, description); there's no fixed schema to match today, just keep it
consistent within one skill's fixtures.

**Never put hints about the planted findings in the fixture files
themselves** (no giveaway comments) — the answer belongs only in
`expected-findings.json`.

## Runner

`run-evals.ts` (or `.sh`) is not built yet. When it is, the intended shape:
for each skill, run an agent without the skill and with the skill against
each fixture, parse a structured `{file, line, rule}`-style output, diff
against `expected-findings.json` to compute precision/recall, and fail CI if
recall regresses below a threshold. A separate `package.json` under
`skill-evals/` is not required if the runner ends up being a simple
bash/ts-node script that shells out to the Claude Code CLI in headless mode
— follow `e2e/`'s precedent only if the runner's own dependencies actually
need isolating.

## Run output and the `-v-N` round number

Disposable run output (snapshots, per-run `outputs/`, `grading.json`,
`benchmark.json`) goes in `skill-evals/<skill-name>/outputs/<skill-name>-v-N/`
— gitignored, never committed. `N` is **per skill**, not global:

- A skill's first comparison round is `<skill-name>-v-2`.
- A second round for the *same* skill (a new rule added, a new fixture,
  another old-vs-new comparison) is `<skill-name>-v-3`, then `v-4`, and so on.
- A different skill's first-ever round always starts at its own `v-2`,
  regardless of what number any other skill is on — `onion-architecture`
  being on `v-2` says nothing about what number `repo-conventions-reviewer`
  (or any other skill) starts at.

`.gitignore` covers this with one glob — `skill-evals/*/outputs/` — so no
skill's `-v-2`, `-v-3`, etc. needs its own `.gitignore` edit.

Current state: `onion-architecture` has run output only
(`outputs/onion-architecture-v-2/`) — its comparisons so far used ad hoc
fixtures in `server/src`, not committed `evals.json`/`fixtures/`, so those
are still TODO for this skill. `repo-conventions-reviewer` has both committed
fixtures (`fixtures/`, `evals.json`) and run output
(`outputs/repo-conventions-reviewer-v-2/`).
