# Skills — demo files and the control experiment

Skills are markdown rubrics attached to a review agent (`Skills` page → agent editor
→ `Skills` tab). Their bodies are inserted into the agent's prompt under
`## Skills / rules`, in link order. The spec is `specs/02-skills-for-review-agents.md`.

## Files to import (Skills → Add → Import)

| File | What it shows |
| --- | --- |
| `test-flakiness-checklist.zip` | A skill archive containing `SKILL.md` **and** `scripts/run.sh` + a binary asset. The preview stores nothing; the script and asset are listed as *ignored* and are never read or run. Link it to **Test Quality Reviewer**. |
| `api-deprecation-policy.md` | A plain markdown skill with frontmatter (`name`, `description`, `type`). Link it to **API Contract Reviewer**. |

The import screen shows the extracted core, trust warnings and ignored files. Save
only after reading it: an imported skill is someone else's instructions inside your
agent's prompt.

## Seeded skills

`pnpm db:seed` (idempotent) creates the agents **Test Quality Reviewer** and
**API Contract Reviewer** and links, in prompt order:

- Test Quality: `test-branch-coverage`, `test-mocking-discipline`
- API Contract: `api-breaking-changes`, `contract-sync-discipline`

## Control experiment

Use the same PR and the same model twice per agent; only the skills differ.

1. **Test Quality** — a PR that adds a function with an `if`/error branch and a test
   for the happy path only.
   - Skills **off** (unlink or disable both, Agent → Skills): the agent tends to
     approve — the test "exists".
   - Skills **on**: it flags the uncovered branch and the missing boundary case.
2. **API Contract** — a PR that renames a response field or changes a route's
   signature while a consumer still uses the old one.
   - Skills **off**: usually no finding.
   - Skills **on**: it reports the breaking change and names the consumer.
3. Open the run → **Trace** → *Prompt assembly*: with skills on there is a
   **Skills** block with its token estimate; with skills off there is none. The
   Live Log shows one `skills: N attached (+~T tokens) — names` line only when at
   least one skill is enabled on both the skill and the agent link.

Model output is not deterministic; run each arm a couple of times. The prompt
difference itself (block present/absent, order, tokens) is deterministic and is
covered by `server/test/skills.it.test.ts`.
