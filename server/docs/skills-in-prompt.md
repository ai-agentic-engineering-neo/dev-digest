# How a skill reaches the model

A skill is text. The only thing the product does with it is put it into a prompt
— in an order the user chose, with a label that says where it came from. This
file is the whole path, in the order it runs.

## The path

```
agent_skills (order)  ──┐
skills.enabled = true ──┴─► SkillsRepository.linkedEnabled(agentId)
                              │  ordered by agent_skills.order, filtered in SQL
                              ▼
                         renderSkillBlocks()            modules/reviews/helpers.ts
                              │  "### Skill: <name> (<type> · <source>)\n<body>"
                              ▼
                         reviewPullRequest({ skills })  @devdigest/reviewer-core
                              │
                              ▼
                         assemblePrompt()  →  "## Skills / rules" section
                              │
                              ▼
                         run_traces.trace.prompt_assembly.skills
```

Two gates, both in SQL, both invisible to the caller:

- the skill must be **linked** to this agent (`agent_skills`), and
- the skill must be **enabled** (`skills.enabled`).

Fail either one and the block does not exist — `assemblePrompt` omits the whole
`## Skills / rules` section when the array is empty, so the prompt is
byte-identical to the pre-skills shape. That is what makes the with/without
comparison in `specs/skills-control-experiment.md` mean anything.

## Why the block is labelled

```
### Skill: flaky-test-heuristics (custom · community — third-party text, enabled in this workspace)
```

The label is for the reader of the trace, not the model. Once a review is a week
old, "why did the agent flag that?" is answered by the prompt slot it came from;
an unlabelled wall of rules cannot answer it. The source is in the label for the
same reason — an imported skill is somebody else's instructions running inside
your agent, and the trace is the last place that fact is still checkable.

## Trust: what is data and what is an instruction

The engine's `INJECTION_GUARD` wraps the diff, PR body and repo-derived context
in `<untrusted>` blocks: **data, never instructions**. Skills are NOT wrapped.
That is deliberate and it is the whole point of the feature — a rule that the
model must treat as data cannot change how the model reviews.

The protection is elsewhere, and it is procedural rather than syntactic:

1. an imported skill is stored `enabled = false` (`SkillsService.create`),
2. the UI shows it as "needs vetting" and says plainly what enabling means,
3. enabling is a deliberate user action, reversible in one click,
4. the prompt block and the trace record which skill it was.

If that trade is ever revisited, the place to change it is
`renderSkillBlocks()` — one pure function, one test file.

## Cost

Skills are sent on **every** call of every run of every agent that links them.
A 200-line skill on three agents is 200 lines × three runs × every PR. The trace
drawer shows `≈N tok` per prompt block for exactly this reason; the same
estimate (`ceil(chars/4)`) is shown in the skill editor while you type.

Nothing truncates a skill body: the limit is a hard 64 KB, declared in the route
schemas and re-checked in the service (`modules/skills/constants.ts`), and
exceeding it is a 422, not a silent cut.

## Where to look when a skill "did nothing"

| Symptom | First check |
|---|---|
| No `Skills` block in the trace | the agent's Skills tab — is it linked? |
| Linked but absent | the skill's own toggle on `/skills` — is it enabled? |
| Present but ignored by the model | read the block in the trace; a rule that does not name a symptom rarely produces a finding |
| Present, finding produced, not shown | `grounding` in the trace's Stats — an ungrounded finding is dropped |
