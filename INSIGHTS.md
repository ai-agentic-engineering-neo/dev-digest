# DevDigest — insights (cross-package)

Things that are true about this repo but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Package-scoped findings live in [`client`](client/INSIGHTS.md) ·
[`server`](server/INSIGHTS.md) · [`reviewer-core`](reviewer-core/INSIGHTS.md) ·
[`e2e`](e2e/INSIGHTS.md).
repo-intel findings live in [`server/src/modules/repo-intel`](server/src/modules/repo-intel/INSIGHTS.md).
Agents write here only through the `engineering-insights` skill, whose script
inserts lines and never changes existing ones.

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## What works

## What doesn't work

## Codebase patterns

## Tool & library notes

## Recurring errors & fixes

- **2026-09-23** — Following the root README's manual steps crashes the API:
  they never install `reviewer-core` deps, but the API imports its raw source and
  resolves `openai`/`zod` from `reviewer-core/node_modules`. `dev.sh` does it;
  by hand run `cd reviewer-core && npm ci`. Evidence: `scripts/dev.sh:78-80`,
  `README.md:118-127`.

## Doc drift

- **2026-09-23** — The docs disagree on resetting the DB: the root README
  recommends `docker compose down -v`, `e2e/README.md` forbids it because it
  wipes every imported repo and review. Evidence: `README.md:160`,
  `e2e/README.md:46`.
- **2026-09-23** — README says "two built-in reviewers (General + Security)" and
  lists only OpenAI/Anthropic keys; the seed creates three agents (+ Performance),
  all on `openrouter` / `deepseek/deepseek-v4-flash`. Evidence: `README.md:73,113`,
  `server/src/db/seed.ts:12-13,22`.
- **2026-09-23** — `.claude/skills/README.md` says skills reach Cursor through a
  `.cursor/skills → ../.claude/skills` symlink, but the repo has no `.cursor/`,
  so Cursor sees none of them → create the symlink if Cursor needs the skills.
  Evidence: `.claude/skills/README.md:3`, `ls .cursor` (missing).

## Session notes

- **2026-09-23** — Added the engineering-insights skill and the fixed sections: +2 (Doc drift, Open questions)

## Open questions

- **2026-09-23** — `e2e-web.yml` and `server-integration.yml` have no
  `reviewer-core/**` path filter, yet the API they boot loads `reviewer-core` at
  runtime — an engine-only change skips both suites. Intentional? Evidence:
  `.github/workflows/e2e-web.yml`, `.github/workflows/server-integration.yml`
  (`paths:`).
- **2026-09-23** — `skills-lock.json` is not the skill inventory: it lists
  `architecture-patterns` and `github-workflow-automation`, which are not in
  `.claude/skills/`, and omits five that are (`engineering-insights`,
  `mermaid-diagram`, `react-*`, `security`) → use `ls .claude/skills` for what is
  installed. Maintained by a tool, or stale? Evidence: `skills-lock.json`.
