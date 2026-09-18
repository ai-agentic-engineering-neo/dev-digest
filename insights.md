# DevDigest — insights

Durable findings: things that are true about this code but not visible in it.
Recorded by agents at the end of a non-trivial task, per `CLAUDE.md` → *After
finishing*.

**Rules**

- **Append-only.** Correct a stale entry with a dated note *beneath* it; never edit
  it away. The history of what we believed is itself useful.
- **Every entry cites evidence** — a `path:line`, a command, or a diff — so the next
  session can re-verify in seconds instead of trusting it.
- **Fixed sections. Never invent a heading.** Add to the one that fits.
- Entry shape: `**YYYY-MM-DD** — <claim in one sentence>. Evidence: <path:line>.`

This is the **root** file: it holds only findings that cross package boundaries.
Anything scoped to one package lives in that package's file —
[`client`](client/insights.md) · [`server`](server/insights.md) ·
[`reviewer-core`](reviewer-core/insights.md) · [`e2e`](e2e/insights.md).

## Gotchas & fixes

- **2026-09-18** — Half this repo is pnpm and half is npm, so running `pnpm install`
  in `reviewer-core/` or `e2e/` creates a second competing lockfile. Match the
  lockfile already in the directory, not the root README's pnpm prerequisite.
  Evidence: `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml` vs
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`.

## Codebase patterns

- **2026-09-18** — No package in this repo has ESLint — no config file, no `eslint`
  dependency, no `lint` script, and no lint step in any of the five workflows — so
  nothing mechanically enforces import direction, hook deps, or any convention
  written in a `CLAUDE.md`. "Lint" here means `typecheck`. Evidence:
  `find . -maxdepth 2 -name 'eslint.config.*'` → empty; `grep -l '"lint"'
  */package.json` → empty.

- **2026-09-18** — `.gitignore` carries un-ignore rules for an `agent-runner/dist/`
  that does not exist yet; they are pre-staged for the Export-to-CI lesson (L06),
  not leftovers to clean up. Evidence: `.gitignore:3-6`,
  `reviewer-core/README.md:7-9`.

## Rejected approaches

## Open questions

- **2026-09-18** — `skills-lock.json` disagrees with `.claude/skills/` in both
  directions, so it cannot be read as an index of available skills — read the
  directory. Lock-only: `architecture-patterns`, `github-workflow-automation`.
  Disk-only: `mermaid-diagram`, `react-best-practices`, `react-testing-library`,
  `security`. Are the lock-only two planned additions, or removed skills whose lock
  entries were never cleaned?

- **2026-09-18** — `.claude/skills/README.md` documents a
  `.cursor/skills → ../.claude/skills` symlink that does not exist, so Cursor gets no
  skills here. Evidence: `ls .cursor` → no such directory. Stale doc, or an unfinished
  setup step?
