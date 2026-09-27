# Writing agent prompts

How a review agent's `system_prompt` is turned into the messages a model sees, and
the conventions that keep findings, scores, and verdicts consistent.

These are the prompts that drive each reviewer agent (stored on `agents.system_prompt`
in the DB). The canonical, reviewable copies live next to this file:

- [`general-reviewer.md`](./general-reviewer.md)
- [`security-reviewer.md`](./security-reviewer.md)
- [`performance-reviewer.md`](./performance-reviewer.md)

> The DB is the source of truth at run time. These files are the human-readable
> originals — when you change a prompt, edit the file here **and** push it to the
> agent (`PUT /agents/:id`, which versions the change into `agent_versions`).

## How a prompt is assembled

Assembly happens in `reviewer-core/src/prompt.ts` (`assemblePrompt`). The model
receives exactly two messages:

**System message** = your agent prompt **+** a fixed injection guard:

```
<your system_prompt>

<INJECTION_GUARD>   // appended verbatim to EVERY agent, every run
```

`INJECTION_GUARD` (`prompt.ts:16`) tells the model that everything inside
`<untrusted>…</untrusted>` is data, never instructions, and that claims like "test
fixture / not for production / ignore this" never descope the review. You do not
need to repeat any of this in your prompt — it is always there.

**User message** = the task and all context, in this order, each untrusted block
delimiter-wrapped (`prompt.ts:104-122`):

```
<task line, e.g. "Review PR #7 '…'">
## PR description        (untrusted, author-controlled, truncated to 4000 chars)
## PR intent (derived …) (untrusted, derived from PR body/linked issue/spec)
## Skills / rules        (linked skill bodies)
## Relevant memory       (curated memory items)
## Repo skeleton         (untrusted, repo-derived)
## Project context       (untrusted spec chunks)
## Callers of changed symbols  (untrusted, repo-derived)
## Diff to review        (trusted line-number rule + untrusted numbered diff)
```

Sections with no content are omitted. Everything repo- or author-derived is wrapped
in `<untrusted source="…">…</untrusted>` so the model can tell instructions
(system) from data (user).

Each of these sections (`system_prompt`, `injection_guard`, `task`,
`pr_description`, `intent`, `skills`, `memory`, `repo_map`, `specs`,
`callers`, `diff`) is also what `PROMPT_LOG` records: set `PROMPT_LOG=verbose`
locally (`server/README.md` § Prompt logging) to log a `'prompt: assembled'`
line per prompt with each section's name, source, role, untrusted flag, char
count and a 12-hex fingerprint — never the section text itself. Comparing
fingerprints across runs is the fastest way to spot prompt drift (a section
that changed shape without a code change).

## Numbered diff (line-number gutter)

The model never has to count down from a `@@ -a,b +c,d @@` hunk header — it
miscounts, and grounding then keeps the model's wrong line (context lines are
part of the hunk too). Before the diff reaches `assemblePrompt`, `run.ts` runs
it through `numberDiff` (`reviewer-core/src/review/numbered-diff.ts`), which
prints every line's own new-file line number in a 6-column, right-aligned
gutter plus one space (`"   446 "`); a line with no new-file number — a
`diff --git`/`---`/`+++` header, a `@@` header itself, a deleted `-` line, or a
`\ No newline at end of file` marker — gets a blank gutter (7 spaces) instead.
The counter restarts at each `@@` header, from that hunk's new-file start. One
exception: a hunk that only deletes lines has nothing numbered in its body, so
its `@@` line prints the hunk's new-file start (`     9 @@ -10,2 +9,0 @@`, `0`
for a deleted file) — the number to cite for that removed code, and the one
line grounding accepts for such a hunk.
Example (PR #5, `events-map.component.ts`):

```
@@ -443,6 +443,8 @@ export class EventsMapComponent
   443      */
   444      private eventNamesMapping: EventNamesMap | null = null;
   445 
   446 +    private gmapApiKey = '…'; // test issue 1
   447 +
   448      get eventsSearchControl() {
```

`## Diff to review` therefore carries two things: a **trusted** instruction
(`DIFF_LINE_NUMBER_RULE`, pushed by `assemblePrompt` itself, outside the
`<untrusted>` wrapper — the model can never be told by diff content to ignore
it) telling the model to read `start_line`/`end_line` off the printed gutter,
never the hunk header, and to cite deleted code by the nearest printed number
in its hunk (the `@@` anchor when the hunk only deletes); followed by the
**untrusted**, numbered diff. `numberDiff` and `parseUnifiedDiff`'s
`newLineNumbers` — the exact set citation grounding checks — are both derived
from one parse (`reviewer-core/src/diff/parse.ts`'s `parseDiff`), so they
cannot disagree with each other by construction, and a number the model copies
verbatim always survives grounding. A `+++`/`--- ` line inside a hunk is
content, not a file header — it is classified as a plain addition/deletion
like any other `+`/`-` line, only real `--- `/`+++ ` headers (outside a hunk)
are exempt.

## Skill ordering

`## Skills / rules` is the bodies of the skills attached to the agent, joined
with a blank line **in link order** — `agent_skills.order`, which the Agent
editor's Skills tab sets by drag or the ↑/↓ buttons. Order is editorial, not
cosmetic: earlier blocks frame how the model reads later ones, so put the
general rubric before the narrow rules.

A skill reaches the prompt only when **both** switches are on — the link's own
`enabled` (this agent wants it) and the skill's `enabled` (the workspace wants
it at all). An agent with no enabled skills produces a prompt byte-identical to
one from before skills existed, because the section is omitted entirely.

Skill bodies are **not** `<untrusted>`-wrapped: they are workspace-authored
instructions, like the system prompt. Anything imported from outside is data,
not instruction — the import path accepts Markdown text only, executes nothing,
and stores the file verbatim for a human to read before enabling it.

## The output schema is NOT in the prompt

This is the most common source of confusion. The structure of the response — the
`{ verdict, summary, score, findings[] }` object and every field type — is enforced
**out of band** by the provider, not by prompt text:

```ts
// reviewer-core/src/llm/openrouter.ts
response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }
```

The schema is the Zod `Review` contract in
`server/src/vendor/shared/contracts/findings.ts`, converted to JSON Schema and sent
as a separate API parameter. In `strict` mode the model **cannot** return anything
that doesn't match it. Consequences for prompt authors:

- **Do not describe the JSON shape, field names, or a markdown layout in the prompt.**
  It is redundant at best and actively harmful when it disagrees with the schema
  (e.g. a prompt that asks for `### [SEVERITY]` markdown sections while the schema
  demands a JSON object — the model gets two conflicting specs and produces garbage
  in the fields the prompt didn't pin down).
- **Use the schema's own vocabulary.** Severity is exactly `CRITICAL | WARNING |
  SUGGESTION`. Verdict is exactly `request_changes | approve | comment`. Do not
  introduce a different scale ("High/Medium/Low") in the prompt — the model will map
  it onto the enum inconsistently and inflate severities.
- **Field *meaning* belongs in the schema's `.describe()`, field *judgment* belongs
  in the prompt.** The prompt's job is to tell the model *what to flag and at what
  severity*, and *when each verdict applies* — not what the JSON looks like.

## Required conventions (every reviewer prompt)

Every reviewer prompt must end with three blocks, because the engine derives
numbers and gates from what the model returns:

1. **Severity rubric** mapped to the three enum levels, with an explicit
   anti-inflation rule. Only `CRITICAL` blocks merge, so a model that calls
   everything CRITICAL turns every PR into a blocker. State plainly that speculative
   issues ("might be", "if not already handled") are at most `WARNING`.

2. **Verdict semantics.** The model owns `verdict`, so it must be told the mapping:
   `request_changes` ⇔ at least one CRITICAL; `comment` ⇔ only non-blocking
   findings; `approve` ⇔ empty findings list. **No findings ⇒ approve.** Without
   this, models default `verdict` arbitrarily (we have observed `request_changes`
   returned with zero findings and a summary saying "no issues found").

3. **Findings discipline.** No duplicate findings; no padding toward a count. There
   is no minimum or target — zero is a good answer. Models treat "return at most N
   findings" as a quota and pad the list with repeats to hit N, which also corrupts
   the score. State that the count is free and repeats are forbidden.

## How the engine uses the output (why the conventions matter)

`reviewer-core/src/review/run.ts` + `reduce.ts`:

- **`score` is recomputed**, never trusted from the model:
  `scoreFromFindings(grounded)` (`reduce.ts:27`). 0 findings ⇒ 100; each CRITICAL
  −35, WARNING −12, SUGGESTION −3. So the number on screen always matches the
  findings list. The model's self-reported score is ignored.
- **Findings are citation-grounded**: a finding whose line range doesn't intersect a
  real diff hunk is dropped (`grounding.ts`). Cite real `file:line` from the diff or
  the finding disappears — the cited line must be the number printed in the
  diff's gutter (see § Numbered diff), never a line counted from the `@@` header.
- **`verdict` is currently passed through from the model** (`run.ts:208`). That is
  why a wrong verdict reaches the UI unchanged — and why the verdict convention
  above is load-bearing until/unless the verdict is also derived deterministically.

## Severity / verdict / gate at a glance

| Model returns | Engine does |
|---|---|
| `findings[].severity` | recompute `score`; count CRITICAL as blockers |
| `score` | **ignored** — recomputed from findings |
| `verdict` | passed through to the review record (shown in the UI) |
| `findings[]` | citation-grounded; ungrounded ones dropped |

The per-agent merge gate (`agents.ciFailOn`, default `critical`) decides when a CI
review **blocks**: it is deterministic from finding severities, independent of the
model's `verdict`. Keep your severities honest and the gate behaves.

## Checklist before shipping a prompt

- [ ] Role + concrete "what to look for", in priority order.
- [ ] "Analyze along the execution path; state the mechanism" guidance.
- [ ] Quality bar: precision over volume; empty list is allowed.
- [ ] Severity rubric using `CRITICAL/WARNING/SUGGESTION` + anti-inflation rule.
- [ ] Verdict mapping incl. "no findings ⇒ approve".
- [ ] Findings discipline: distinct only, no count target.
- [ ] No JSON shape / markdown layout / alternate severity scale described in prose.
- [ ] No "return at most N findings" quota.
- [ ] File updated here **and** pushed to the agent (versioned).
