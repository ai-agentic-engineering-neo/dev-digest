# docs/agent-prompts/ — reviewer agent prompt library

Full assembly model, output-schema rules, and the required-conventions checklist:
[README.md](./README.md).

## The one rule
**The DB (`agents.system_prompt`) is the source of truth at runtime** — these
`.md` files are the human-readable originals. When you edit a prompt here, also
push it via `PUT /agents/:id` so it versions into `agent_versions`, or the two
copies drift.

## Non-default conventions
- Never describe the JSON output shape or an alternate severity scale in prompt
  prose — the schema is enforced out-of-band (`response_format: json_schema`,
  strict mode) and conflicting prose degrades output quality.
- Every prompt must end with the three required blocks: severity rubric
  (anti-inflation), verdict semantics, findings discipline. See the checklist
  in the README before shipping a prompt change.

## Links
[README](./README.md) · [Root CLAUDE.md](../../CLAUDE.md)
