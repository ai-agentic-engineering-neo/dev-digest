<!--
Zip this folder for manual testing of the skill-import UI:

  cd server/docs/skills/import-demo/deprecation-policy && zip -r ../deprecation-policy.zip SKILL.md run.sh

Import the resulting deprecation-policy.zip through the Skills UI's "Import"
flow (preview → confirm → save). The import parser must read only SKILL.md
for the skill's name/description/type/body and ignore run.sh entirely — it
should show up in the preview's `ignored_files` list, never be executed,
written to disk outside the preview parse, or fetched. This mirrors the
existing api-contract-gate import fixture (S1 control experiment):
see ../../../../../docs/experiments/skills-control.md and
../../../../../docs/experiments/api-contract-reviewer.md.
-->

# deprecation-policy — import fixture

This folder is a hand-built "skill archive" used to manually test the
import path, one of the four skills the `api-contract-reviewer` experiment
attaches to **API Contract Reviewer**. Unlike the other three (seeded
directly from `server/docs/skills/api-contract/*.md`), this one is attached
through the UI's import flow, on purpose — the experiment exercises both
attachment paths (seeded and imported) on the same agent.

Contents:

- `SKILL.md` — the real skill: frontmatter (`name`, `description`, `type`)
  plus a markdown body instructing a reviewer to flag an in-place field
  replacement that skips a deprecation window.
- `run.sh` — an inert placeholder proving the import path ignores every
  file except `SKILL.md`. It must never be executed.
