# 03 — Conventions Extractor

## Goal
Derive a skill from the repo itself: scan a repo for house conventions, show each with
code evidence, let the user accept/reject/edit, and turn the accepted ones into one
`convention` skill (`source: extracted`) that can be linked to an agent.
Second deliverable: an **API Contract Reviewer** agent with 4 skills.

## Scope
In: `modules/conventions` (extract, list, edit, reject, select-all), evidence check,
Conventions page, skill-from-conventions modal, API Contract Reviewer seed + docs.
Out: executing anything, cross-repo conventions, a "rejected" history, auto-linking.

## Decisions
- **No migration.** The `conventions` table already fits. `accepted` is a boolean, so
  **reject = delete the row**; "Deselect all" sets `accepted=false`.
- **One structured call**, cheap model from Settings → feature model `conventions`
  (`resolveFeatureModel`). Input is assembled by code: style configs (`CONFIG_FILES`)
  + `repoIntel.getConventionSamples(repoId, 12)`, read with `readContainedFile`,
  capped per file (8k) and in total (80k chars).
- **Evidence gate before any write.** A candidate is kept only if its path is one of the
  files actually sent AND its snippet (whitespace-normalized) occurs in that file.
  Duplicates (by normalized rule) are dropped. `dropped` is returned.
- **Re-scan** replaces non-accepted candidates; accepted ones stay and their rule is not re-added.
- **Unindexed repo / no clone → 409 `repo_not_ready`**, not a silent empty result.
- **Injection**: file text goes through `wrapUntrusted`; `INJECTION_GUARD` (now exported
  from reviewer-core) is appended to the extractor system prompt.
- **Skill save reuses `POST /skills`**; `SkillCreate` gained optional `evidence_files`.
- Prompt: `server/src/prompts/conventions.system.md`.

## API
- `GET  /repos/:id/conventions`
- `POST /repos/:id/conventions/extract` (rate limit 5/min)
- `PATCH /repos/:id/conventions` `{accepted}` · `PATCH /conventions/:id` `{rule?, accepted?}` · `DELETE /conventions/:id`

## Acceptance criteria
1. Extraction on an indexed repo lists candidates, each with a real file and a snippet found in it.
2. Candidates with a missing file or absent snippet never reach the DB (test: 1 good + 2 bad → 1 row).
3. Accept/reject/edit persist; foreign-workspace repo/convention → 404 and no LLM call.
4. "Create skill" opens a modal with name, description, body prefilled from accepted
   candidates; cancel discards; save creates a `convention`/`extracted` skill.
5. The skill linked in the agent's Skills tab appears as a `## Skills / rules` block in the run trace.
6. API Contract Reviewer is seeded with `breaking-change`, `response-schema`,
   `semver-discipline`; `deprecation-policy` is imported via the UI (zip or md).
