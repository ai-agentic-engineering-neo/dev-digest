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

- **2026-09-23** — Severity has 3 levels in the contract (`CRITICAL`, `WARNING`,
  `SUGGESTION`), but 4 in the client UI kit (`SEV`, `Severity`) and in
  `FindingsPanel`'s sort order, which add `INFO` → iterate the contract's three
  levels when rendering per-severity counts; a finding is never `INFO`. Evidence:
  `server/src/vendor/shared/contracts/findings.ts:11`,
  `client/src/vendor/ui/primitives/tokens.ts:3`.
- **2026-09-23** — Every CLAUDE.md must stay under 100 lines (the user's rule; the repo doesn't state it, and `5a759d1` shortened the root from 102 to 94 for it). After HW1 block D the root is at 99 → put new rules in a package `CLAUDE.md` (all are under 85) or a linked doc; merging or shortening existing root lines needs the user's OK, and the structure (headings, block types) must stay. Evidence: `CLAUDE.md:62-66` (Naming conventions, the last 5 lines added).
  - **2026-09-23** — superseded: "all are under 85" no longer holds — `server/CLAUDE.md` grew to 86 lines in `faa6678` (packages are now 61–86, root still 99). Evidence: `server/CLAUDE.md:86`.

## Tool & library notes

- **2026-09-23** — `append-insight.mjs` checks only the `**YYYY-MM-DD** —` prefix and never the evidence, so entries without a `path:line` go in unnoticed (4 so far: two in root Open questions, two in `client/INSIGHTS.md`) → before appending, make sure the Evidence has a `path:line`, not a command or a bare file. Evidence: `.claude/skills/engineering-insights/scripts/append-insight.mjs:22`, `client/INSIGHTS.md:18,46`.
  - **2026-09-23** — superseded: the script now refuses any entry outside Session notes without a backticked `file.ext:line` (a bare file, a command, `localhost:3101` or an IP:port don't count), and the four entries it had let through got line-evidence sub-bullets. Evidence: `.claude/skills/engineering-insights/scripts/append-insight.mjs:76-82`.
- **2026-09-23** — The machine's pnpm is 12.5.1 (`CLAUDE.md` only asks for ≥10), and it rejects the short `-s` flag with `error: unexpected argument '-s' found`: `pnpm -s typecheck` runs nothing → use `pnpm --silent <script>` or plain `pnpm <script>` in `server/` and `client/`. `npm run -s` in `reviewer-core/` and `e2e/` is fine. Evidence: `CLAUDE.md:22`.
  - **2026-09-23** — Narrower than it reads: only the shorthand `pnpm -s <script>` fails; `pnpm -s run <script>` works (`pnpm -s run typecheck` in `server/` exits 0), and no file in the repo uses `pnpm -s`. Evidence: `INSIGHTS.md:32`, `server/package.json:6`.
- **2026-09-23** — A `path:line` that points *into* an `INSIGHTS.md` goes stale on the next append: the script splices lines in mid-file, so every later entry shifts. The `append-insight.mjs` entry's `client/INSIGHTS.md:46` is now a blank line, and a citation of root `:32` written in this session was one line off a minute later → cite the code (or quote the entry's text), never an INSIGHTS line. Evidence: `.claude/skills/engineering-insights/scripts/append-insight.mjs:149`, `client/INSIGHTS.md:46`.

## Recurring errors & fixes

- **2026-09-23** — Following the root README's manual steps crashes the API:
  they never install `reviewer-core` deps, but the API imports its raw source and
  resolves `openai`/`zod` from `reviewer-core/node_modules`. `dev.sh` does it;
  by hand run `cd reviewer-core && npm ci`. Evidence: `scripts/dev.sh:78-80`,
  `README.md:118-127`.
- **2026-09-23** — Running `e2e:hermetic` while the dev web is up breaks the dev
  web: `e2e.sh` runs its own `next dev` in `client/`, which shares `client/.next`,
  and bakes in `NEXT_PUBLIC_API_BASE=http://localhost:3101`. Afterwards `:3000`
  shows "Cannot reach the DevDigest engine at http://localhost:3101" → restart the
  dev web after a hermetic run (touching a route's file only rebuilds that route).
  A separate `distDir` for the e2e web would fix it for good. Evidence:
  `scripts/e2e.sh:42,148`, `e2e/README.md:43-44`.
  - **2026-09-23** — It can also take the whole dev stack down: during a hermetic run (7/7 passed) the dev web on :3000 exited, and because `dev.sh` runs the client in the foreground, its EXIT trap then killed the API on :3001 (Postgres stayed up). The exact reason the dev web exited was not traced → after a hermetic run, check `lsof -iTCP:3000 -sTCP:LISTEN` and `:3001`, and restart with `./scripts/dev.sh --no-seed`. Evidence: `scripts/dev.sh:98-110`, `scripts/e2e.sh:148`.
  - **2026-09-23** — A third form: the dev web stays up but every route returns HTTP 404 and the page shows "missing required error components, refreshing..." (the hermetic `next dev` rewrote the shared `client/.next`); reloading doesn't help, only a restart. Check `lsof -iTCP:3000 -sTCP:LISTEN` *before* a hermetic run, not only after — the dev stack may have been restarted since you last looked. Evidence: `scripts/e2e.sh:148`, `scripts/dev.sh:108-110`.

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
- **2026-09-23** — Three prices for `deepseek/deepseek-v4-flash` disagree: the
  model guide says 0.09/0.18 $/M, the server's fallback table 0.14/0.28, and a
  real OpenRouter run billed $0.000173 for 1,642→62 tokens (guide ⇒ $0.000159,
  table ⇒ $0.000247) → for real spend use `agent_runs.cost_usd`, not either
  table. Evidence: `docs/agent-prompts/choosing-a-model.md:33`,
  `server/src/adapters/llm/pricing.ts:31`.

## Session notes

- **2026-09-23** — Added the engineering-insights skill and the fixed sections: +2 (Doc drift, Open questions)
- **2026-09-23** — Run Cost Badge (lab task 3): +1 (Doc drift)
- **2026-09-23** — Findings-by-severity spec + plan: +1 (Codebase patterns)
- **2026-09-23** — Findings-by-severity implementation: +1 (Recurring errors & fixes)
- **2026-09-23** — HW1 check against the grading criteria: +1 (Tool & library notes)
- **2026-09-23** — HW1 fixes, block B (hermetic e2e vs the dev stack): +1 (Recurring errors & fixes, nuance)
- **2026-09-23** — HW1 fixes, block D (naming sections + per-package stack): +1 (Codebase patterns)
- **2026-09-23** — HW1 fixes, block E (path:line in every entry + script check): +3 (Open questions ×2 line evidence, Tool & library notes superseded)
- **2026-09-23** — HW1 re-check against the 24 grading criteria: +1 (Tool & library notes)
- **2026-09-23** — PR description + insights audit: +3 (Codebase patterns superseded, Tool & library notes ×2 incl. nuance)

## Open questions

- **2026-09-23** — `e2e-web.yml` and `server-integration.yml` have no
  `reviewer-core/**` path filter, yet the API they boot loads `reviewer-core` at
  runtime — an engine-only change skips both suites. Intentional? Evidence:
  `.github/workflows/e2e-web.yml`, `.github/workflows/server-integration.yml`
  (`paths:`).
  - **2026-09-23** — Line evidence: the `paths:` filters are `.github/workflows/e2e-web.yml:14-24` and `.github/workflows/server-integration.yml:16-22`, and neither lists `reviewer-core/**`, although `.github/workflows/server-integration.yml:53-55` itself says the server source imports reviewer-core.
- **2026-09-23** — `skills-lock.json` is not the skill inventory: it lists
  `architecture-patterns` and `github-workflow-automation`, which are not in
  `.claude/skills/`, and omits five that are (`engineering-insights`,
  `mermaid-diagram`, `react-*`, `security`) → use `ls .claude/skills` for what is
  installed. Maintained by a tool, or stale? Evidence: `skills-lock.json`.
  - **2026-09-23** — Line evidence: `skills-lock.json:4` (`architecture-patterns`) and `skills-lock.json:22` (`github-workflow-automation`); neither folder exists under `.claude/skills/`.
