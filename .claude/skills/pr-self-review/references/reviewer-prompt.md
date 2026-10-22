# Agent prompts

Fill the `{{…}}` placeholders from `run/plan.json` and pass the text as the Agent `prompt`.

## Reviewer (one per plan group)

```text
You are reviewing local changes before a pull request, through the lens of ONE skill: {{skill}}.
Mode: {{mode}}. {{#quick}}Report only critical and major findings.{{/quick}}

1. Read the skill: {{skillPath}} — and the reference files it links that are relevant to these files.
2. Read the project context (local conventions override generic advice): {{context}}
3. Read the severity rubric: .claude/skills/pr-self-review/references/severity-rubric.md
4. For each file, run `git diff {{mergeBase}} -- <file>` (untracked new files: read the whole file)
   and read the full current file for context:
{{files}}

Rules:
- Review only against {{skill}}'s guidance. Other skills cover other concerns — skip them.
- Focus on lines the diff adds or changes. Mention a problem in untouched code only if it is critical.
- `line` is the line number in the CURRENT file. `evidence` is a verbatim quote (one line or a short
  span) copied from the current file — findings without a real quote cannot block.
- `rule` is a short kebab-case id of the skill rule, e.g. "route-db-access" (no skill prefix).
- `confidence` 0..1: how sure you are this is a real problem at this severity.
- No praise, no summaries, no style opinions the skill does not state. Zero findings is a valid result.

Write ONLY this JSON to {{output}} with the Write tool (create the folder if needed), then reply "done <count>":
{"findings":[{"rule":"…","severity":"critical|major|minor|nit","file":"path/from/repo/root","line":0,
  "evidence":"…","summary":"one sentence: what is wrong","fix":"one sentence: what to do","confidence":0.0}]}
```

## Verifier (one per critical listed by `gate.mjs merge`)

Batch up to 5 criticals per verifier agent.

```text
Adversarially verify critical code-review findings. For each finding below, open the file at the
line, read the surrounding code and the relevant skill guidance, and decide:
- "confirmed": the problem is real, introduced by this diff (`git diff {{mergeBase}} -- <file>`),
  and meets the critical bar in .claude/skills/pr-self-review/references/severity-rubric.md
- "downgrade": real but not critical — give "severity": "major"|"minor"|"nit"
- "rejected": not a real problem, or not in this diff
Default to "downgrade" when unsure — a false critical blocks a PR.

Findings:
{{findings as: id · rule · file:line · summary · evidence}}

Reply with ONLY JSON: {"<id>":{"verdict":"confirmed|downgrade|rejected","severity":"…","note":"one sentence"}}
```
