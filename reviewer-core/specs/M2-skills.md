# M2 — Skills (reviewer-core)

Status: draft

## Problem

`assemblePrompt` already accepts `skills?: string[]` and renders them under
`## Skills / rules`, but each caller has to decide how a skill turns into text.
Without one format, the studio and the CI runner would render skills
differently, and the model would not see a skill's name and description, which
together are the skill's interface.

## Goals

- One exported `formatSkills` turns resolved skills into the strings that
  `assemblePrompt` expects, in the order it was given.
- Each skill reaches the model as its name, its description and its body.
- `assemblePrompt` itself is unchanged.

## Non-goals

- Choosing which skills load. The server decides: linked, enabled on the link
  and enabled globally. No routing by description happens here.
- Counting tokens. The server counts `skills_tokens` with its tokenizer
  (`js-tiktoken` is a server dependency). reviewer-core stays tokenizer-free:
  its only dependencies are `openai` and `zod`.
- Sanitizing skill text. Skills are trusted instructions (see Behaviour).
- Loading skills from the DB or the filesystem. Callers pass resolved data.

## Behaviour

- `formatSkills(skills)` returns one string per skill, in input order:
  `### {name}\n_{description}_\n\n{body}`.
- An empty array returns `[]`. `assemblePrompt` then omits `## Skills / rules`
  and sets `assembly.skills` to `null`, as it does today.
- Skills are trusted. The user approved every one, including imported ones,
  and the import UI shows a trust warning. They are not wrapped in
  `wrapUntrusted`, and no keyword denylist is applied (repo rule). The
  `## Skills / rules` section stays outside the untrusted fences, and the
  injection guard still covers every fenced block.
- No dedupe and no reordering. The order the caller passes is the order the
  agent configured.

## Changes

- Input: none. `ReviewInput.skills` stays `string[]`, and callers fill it with
  `formatSkills(...)`.
- Prompt: no new section. `## Skills / rules` keeps its place after
  `## PR description` and before `## Relevant memory`. It stays unfenced.
- Pipeline: none in `review/run.ts`.
- Output: none. `PromptAssembly.skills` keeps the joined block. The server adds
  `skills_tokens` and `skills_used` (see the server spec).
- Public API: `formatSkills` and `type SkillPromptInput = { name: string;
  description: string; body: string }`, exported from `src/index.ts` next to
  `assemblePrompt`. Implementation lives in `src/prompt.ts`.
- The `PromptParts.skills` doc comment changes from "trusted-ish; community
  skills should be sanitized upstream" to "trusted: user-approved instructions".

## Acceptance criteria

- [ ] `formatSkills([a, b])` returns two strings in the order a, b, each
      shaped `### {name}\n_{description}_\n\n{body}`.
- [ ] `formatSkills([])` returns `[]`.
- [ ] `assemblePrompt({ skills: formatSkills([a, b]) })` puts a before b in
      `## Skills / rules`, outside any `<untrusted>` block, and sets `assembly.skills`.
- [ ] With no skills, the user message has no `## Skills / rules` and
      `assembly.skills` is `null`.

## Tests

- `test/prompt.test.ts`: new `describe('assemblePrompt — ## Skills / rules')`.
  The happy path checks order and format, and that the section is outside the fences.
  The edge case checks that the section is omitted and `assembly.skills` is null for `[]`.
  No existing test covers skills. No LLM is involved.
  See [`TESTING.md`](../../TESTING.md).

## Related specs

- [`../../server/specs/M2-skills.md`](../../server/specs/M2-skills.md)
- [`../../client/specs/M2-skills.md`](../../client/specs/M2-skills.md)

## Open questions

- None.
