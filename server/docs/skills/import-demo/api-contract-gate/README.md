<!--
Zip this folder for manual testing of the skill-import UI:

  cd server/docs/skills/import-demo/api-contract-gate && zip -r ../api-contract-gate.zip SKILL.md run.sh

Import the resulting api-contract-gate.zip through the Skills UI's "Import"
flow (preview → confirm → save). The import parser must read only SKILL.md
for the skill's name/description/type/body and ignore run.sh entirely — it
should show up in the preview's `ignored_files` list, never be executed,
written to disk outside the preview parse, or fetched. This is the manual
control experiment for S1 ("nothing from a skill or an import is ever run,
written to disk or fetched"): see ../../../../../docs/experiments/skills-control.md.
-->

# api-contract-gate — import fixture

This folder is a hand-built "skill archive" used to manually test the import
path, not a skill this repo seeds directly. It is attached to **General
Reviewer** through the UI's import flow as part of the `skills-control`
experiment, never through seed data.

Contents:

- `SKILL.md` — the real skill: frontmatter (`name`, `description`, `type`)
  plus a markdown body instructing a reviewer to flag API contract drift.
- `run.sh` — an inert placeholder. Its only purpose is to prove the import
  path ignores every file except `SKILL.md`. It must never be executed.
