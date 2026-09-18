# Insights — repo root

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** this file holds only findings that cross package boundaries — the
shared contracts, the toolchain, CI, and the dev scripts. Anything scoped to a
single package lives in that package's file:
[`server`](server/INSIGHTS.md) · [`client`](client/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

### 2026-09-17 — Severity counters exclude dismissed findings

**What:** every per-severity count — the PR list's `findings_counts`, the
findings panel's chips, the timeline's run chips — skips findings with a
`dismissed_at`. Accepted findings still count.

**Why:** a counter answers "what still needs attention", and the repo had
already settled that question elsewhere: `ReviewRunAccordion.tsx:56` computes
its blockers as `severity === "CRITICAL" && !f.dismissed_at`. A second, looser
rule next to it would have made two numbers on the same screen disagree.

**Rejected:** counting everything the model produced. Simpler to aggregate (one
`IN`-query, no `isNull`) and it keeps the list row stable, but it contradicts
the blockers count sitting two lines below it on the detail page.

**Consequence worth knowing:** the panel still LISTS a dismissed finding, struck
through, while the counter above it excludes it. That asymmetry is deliberate —
the decision stays visible and reversible — and it is why `severityCounts()`
(`client/src/components/severity-counts/helpers.ts`) filters but
`visibleFindings()` does not.

## What Works

- **2026-09-16** — `main` is trimmed, but the lessons' code is still in git.
  Before building a lesson feature, look for a prior implementation:
  `git log -S '<identifier>' --oneline --all`. The Run Cost feature came back
  from the pair `93119a5` (added it) and `d45ab0d` (removed it) — together they
  held the schema change, the route aggregate, the component and the i18n keys.
  Cheaper and more faithful than re-deriving it from the design mockups.

## What Doesn't Work

## Codebase Patterns

- **2026-09-18** — All seven `<module>/docs/*.md` are deliberate 10-line stubs
  with one shape: `> **Stub.** Not written yet.` + **Purpose** + **What belongs
  here** + **What does not belong here**, each linked from a module `CLAUDE.md`
  "Read when" line. So a convention that seems missing is usually an unfilled
  stub, not a lost rule — and the stub's own *What belongs here* line is the spec
  for filling it, while its exclusion line ("nothing the module `README.md`
  already covers") is the scope limit. `client/docs/component-conventions.md` is
  the first one filled; the other six still hold the template.

- **2026-09-16** — No route anywhere in `server/src/modules/` declares
  `schema.response`, so the `@devdigest/shared` contracts are compile-time only
  on read paths — a response that violates its Zod schema is served, not
  rejected. Consequence when adding a field to a contract that describes a
  PERSISTED document (`RunStats` lives inside the `run_traces.trace` jsonb):
  use `.nullish()`, not `.nullable()`. `nullable()` still requires the key, so
  documents written before the field existed stop type-checking, while rows in
  a nullable DB column are fine with `.nullable()`.
  `server/src/vendor/shared/contracts/trace.ts`

## Tool & Library Notes

- **2026-09-18** — Vitest 2's `--exclude` does **not** replace the built-in
  excludes, contrary to a claim that surfaces when reading its docs. Verified:
  `cd server && pnpm exec vitest list --exclude '**/*.it.test.ts'` lists 105
  tests, zero of them under `node_modules/`, and no `.it.test.ts`. So the line
  `server-unit.yml` inlines is correct as written and needs no file
  enumeration. `.github/workflows/server-unit.yml`

- **2026-09-18** — `while IFS=$'\t' read -r a b c` silently mis-assigns fields
  when a middle field is empty: tab is IFS *whitespace*, so two consecutive tabs
  collapse into one delimiter and everything after the gap shifts left. `jq
  @tsv` emits exactly that for a null column. Emit a placeholder and translate
  it back — `((.log // "") | if . == "" then "-" else . end)` — rather than
  trusting `read` to preserve empties.
  `.claude/skills/pr-self-review/scripts/run-gates.sh`

- **2026-09-18** — `awk -v re="$pat"` processes escape sequences in the value, so
  a regex like `sql\.raw\(` arrives as `sql.raw(` and awk then dies with
  `illegal primary in regular expression`. Pass patterns through the environment
  instead: `PAT="$pat" awk 'BEGIN{p=ENVIRON["PAT"]} $0 ~ p'`.
  `.claude/skills/pr-self-review/scripts/hard-rules.sh`

## Recurring Errors & Fixes

- **2026-09-18** — A tool that writes its output *inside* the repo and also
  reads `git ls-files --others --exclude-standard` will consume its own output:
  the first run's artefact is untracked, so the second run folds it into the
  diff and the byte count grows every time. Symptom here was a change set
  reporting 19 216 diff lines for a 43-file change, tripping a size threshold.
  Add the output directory to `.gitignore` **before** the first run. Note the
  matching gitignore trap: a negation cannot re-include a file inside an
  excluded *directory* — use `dir/*` plus `!dir/keep.json`, not `dir/` plus the
  negation. `.gitignore:25-26`

## Session Notes

- **2026-09-18** — `pr-self-review` skill: routes the open diff onto the repo's
  own skills, runs the matching gates, blocks `gh pr create` on any CRITICAL via
  a `PreToolUse` hook in a new `.claude/settings.json`. Deterministic rules live
  in `scripts/hard-rules.sh`, judgement in the per-bucket subagents; the
  dividing line is whether the diff alone settles it.

- **2026-09-18** — Sprint 1 of the improvement plan: `pnpm lint` + `pnpm arch`
  now exist in BOTH `server/` and `client/` and run in `server-unit.yml` /
  `client.yml`; server migration `0011` adds the seven missing FK/filter
  indexes. Both boundary checks passed on the untouched tree, so they are a
  ratchet against new violations, not a cleanup.

- **2026-09-18** — Naming conventions + lock-file rule. Root `CLAUDE.md` gained a
  `## Naming` section and two `Do not touch` lines (lockfiles are regenerated by
  each directory's own manager; no root `package.json` exists). The client's
  kebab-folder-vs-PascalCase-folder split was undocumented and went into
  `client/CLAUDE.md` + `docs/component-conventions.md`.

- **2026-09-17** — Findings-by-severity (PR list column + panel filter +
  timeline chips). Written fresh, but `git log -S severityCounts --all` still
  paid off: `7641b48`/`97b6edc`/`0953fdc` served as the design spec.

- **2026-09-16** — Run Cost (server + client + shared contracts): recovered the
  reverted implementation from git history, re-threaded `costUsd` end to end.

## Open Questions
