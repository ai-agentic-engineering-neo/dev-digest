# 02 — Skills

## Goal
Let users create, edit and import reusable markdown "skills" and attach them, in
order, to review agents. Enabled skills are injected into the review prompt and are
visible, with their token cost, in the run trace. Add a Test Quality Reviewer agent
as the first consumer.

## Scope
In: skills CRUD and versions (`/skills`), import preview, agent-skill links, prompt
injection in `run-executor.ts`, per-section `prompt_tokens` in the trace, seed
content (Test Quality Reviewer + 4 skills), UI (Skills page, agent Skills tab),
the `pr-self-review` Claude Code skill, docs.
Out: executing anything from a skill, a skill marketplace/URL import, per-link
enable flags.

## Decisions
- **link == enabled.** A link in `agent_skills` means the skill is on for that agent.
  No `enabled` column on the link, no migration. A skill disabled globally
  (`skills.enabled = false`) is skipped.
- **Import is parsed on the server, SKILL.md only.** `.md` is parsed directly; a
  `.zip` is read in memory (fflate, filtered decompression) and only `SKILL.md` (or
  the single `.md`) is taken. Everything else goes to `ignored_files` and is never
  extracted to disk or run. Size and entry-count caps guard against zip bombs.
- **Preview before save.** `POST /skills/import/preview` does not persist; saving
  is a separate `POST /skills` with `source: 'imported_file'`.
- **No migration.** `SkillSource` is a text enum without a DB constraint.
- **Injection point.** `reviewer-core` `assemblePrompt` renders `## Skills / rules`
  after the PR description, before memory. Blocks are `### Skill: <name>` +
  description + body, in link order, enabled only. Empty list: section absent.
- **Token accounting.** `PromptAssembly.prompt_tokens` (optional, so old traces stay
  valid) holds a count per section, including skills, computed via
  `container.tokenizer`.
- **Trust model.** Skills are trusted instructions, not `<untrusted>` data; an
  imported skill is foreign text inside the prompt. The UI shows an untrusted
  notice in the import preview and the user reviews the body before saving.
- **Description is a directive** ("Apply when ...; check ...").
- **Skill panel + restore.** Clicking a skill on `/skills` opens a right-hand panel with
  Config, Preview and Versioning tabs (there is deliberately no `/skills/:id` page). Restore
  (`POST /skills/:id/versions/:version/restore`) is append-only: the old body is saved as a
  new version, history is never rewritten; an identical body is a no-op. Diff is client-side.

## Acceptance criteria
1. A skill can be created and edited in the UI; a body edit bumps the version.
2. An enabled skill appears as its own block in the run log/trace; a disabled or
   unlinked one does not.
3. Import goes through a preview; `scripts/detect.sh` in the zip is listed as an
   ignored file and nothing executable runs.
4. Both flows (seeded, and imported `flaky-test-patterns`) attach skills to the Test
   Quality Reviewer.
5. `/pr-self-review` (manual-only) runs one parallel `pr-skill-reviewer` subagent per
   skill: every UI skill on `client/**`, `onion-architecture` on `server/**`. On a
   mixed diff it reports "Skills loaded: ..." with both sets. A confirmed CRITICAL (or
   an incomplete review) gives `Verdict: BLOCK`, and `.claude/hooks/pr-gate.sh` then
   rejects `gh pr create|merge` until a fresh PASS exists for the current diff
   (`.claude/skills/pr-self-review/scripts/diff-hash.sh`). Limit: merges done in the GitHub UI or
   outside Claude Code are not blocked (needs CI / branch protection).
6. The control experiment below shows the skills changing the review.

## Control experiment
Use the mock-free real LLM setup. Keep the model and PR fixed; change only skill
links.

**(a) Test Quality Reviewer.** PR whose test covers only the happy path of a new
function with a guard branch and a boundary (for example an empty list).
1. Unlink all skills from Test Quality Reviewer, run the review. Expect: the gap is
   missed or only vaguely mentioned.
2. Link `untested-branches`, `missing-corner-cases`, `over-mocking`, re-run.
   Expect: the untested branch and the boundary case are flagged with file:line.

**(b) API contract.** PR that changes a route signature (renames a response field or
adds a required param), reviewed by General Reviewer.
1. Without `api-contract-breaking-changes`: expect the breaking change to be missed
   or under-rated.
2. Link `api-contract-breaking-changes`, re-run. Expect the breaking change flagged
   (CRITICAL if public and unversioned).

For each run open the run trace, then prompt assembly: confirm the Skills block is
present only in the linked runs, and compare the added tokens in the Skills section.
