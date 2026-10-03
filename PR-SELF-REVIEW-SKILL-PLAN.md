# Plan: `pr-self-review` skill

## Context

The repo already has 13 domain skills in `.claude/skills/` (onion-architecture,
frontend-ui-architecture, react-best-practices, fastify-best-practices,
drizzle-orm-patterns, security, zod, typescript-expert, …), each an expert on
one slice of the stack. None of them currently run *automatically* — they
load only when the acting agent's own judgment (or the user's wording)
happens to trigger them. Nothing today:

- looks at the **full local diff** across all four packages before a PR goes
  up,
- **routes** each changed file to the skill(s) that actually own that file's
  domain (a `client/src/app/**/_components/**` change should pull in
  `frontend-ui-architecture` + `react-best-practices`; a
  `server/src/modules/**` change should pull in `onion-architecture` +
  `fastify-best-practices`; nobody should get a mermaid-diagram or
  postgresql review for a component tweak),
- enforces this repo's own **hard, non-negotiable rules** from the root
  `CLAUDE.md` (`Do not touch` list, vendor-mirroring, migration
  immutability, `*.it.test.ts` naming) as part of that same pass, and
- **blocks** on a critical finding rather than just listing it.

**Outcome:** a new `pr-self-review` skill that (1) computes the local diff
scope, (2) classifies changed files into domains using a routing table,
(3) fans out one review pass per (domain, matched-skill) pair so each skill
only ever reviews the files it's actually expert on, (4) separately checks
the CLAUDE.md structural rules that aren't owned by any single skill, (5)
aggregates everything into one severity-tagged report, and (6) hard-blocks
`gh pr create` when any `CRITICAL` finding survives.

## Non-goals

- Not a replacement for the existing global `code-review` / `security-review`
  skills (generic bug-hunting, inline PR comments, `--fix`). `pr-self-review`
  is specifically about **routing this repo's own convention skills at the
  diff** and gating on them. The plan notes where it can optionally chain
  into `code-review` rather than duplicate it.
- Not a CI gate — CI is out of scope. This runs in the developer's local
  Claude Code session before/instead of `gh pr create`.
- Not a linter/typechecker replacement — `pnpm lint`/`pnpm typecheck` remain
  the deterministic source of truth. This skill runs them itself as a
  fast-fail gate (see Execution model, step 0) rather than re-implementing
  their checks with an LLM pass.

## Trigger points

1. **Manual** — `/pr-self-review`, same as any other project skill.
2. **Automatic, soft** — the skill's `description` is written to fire
   proactively whenever the acting agent is about to run `gh pr create`,
   `gh pr edit --ready`, or the user says things like "open a PR", "let's
   ship this", "is this ready to merge". This relies on the agent noticing,
   same as every other skill in this repo today.
3. **Automatic, hard** — a `PreToolUse` hook (added to `.claude/settings.json`
   via the `update-config` skill, *not* part of this skill's own files)
   that intercepts any `Bash` call matching `gh pr create`. The hook doesn't
   run the review itself (hooks are shell commands, not agents) — it checks
   for a fresh **verdict file** (see below) and denies the tool call with a
   message telling the agent to run `/pr-self-review` first if the verdict
   is missing, stale (diff changed since it was written), or `FAIL`.
   This is the only layer that's an actual gate rather than agent good
   behavior — flagging it as a separate, later step since it touches
   `.claude/settings.json` and needs its own sign-off.

## Diff scope

- Base: `git merge-base origin/<default-branch> HEAD` (default branch read
  from `git remote show origin` or defaulted to `main`, matching this repo).
- Scope = committed-but-unpushed changes (`git diff <merge-base>...HEAD`)
  **union** working-tree changes, both staged and unstaged
  (`git diff HEAD`) — i.e. everything that would end up in the PR if
  committed and pushed right now. Untracked new files count too
  (`git status --porcelain` for `??` entries).
- Renames/deletes are classified by their new (or last-known) path.
- The routing step only needs changed paths; the per-domain review passes
  get the actual patch hunks plus full current file content for files under
  ~400 lines (skills like `onion-architecture` need module-level context,
  not just the hunk).
- **Diff-too-big guard:** if scope exceeds a threshold (e.g. >40 files or
  >1500 changed lines), don't silently fan out at equal depth across all of
  it — emit a standing `MEDIUM` finding ("this is N files / plausibly M
  separate PRs, consider splitting") before spending the fork budget, and
  cap how many files each domain fork is handed in one shot so no single
  pass silently truncates its own context.

## File → skill routing table

This table is the core deliverable and lives in its own data file (see
Files below) so it can be updated without touching the skill's prose —
same separation `onion-architecture` uses for `layer-map.md`.

| Path pattern | Matched skill(s) | Notes |
|---|---|---|
| `client/src/app/**/_components/**`, `client/src/components/**` | `frontend-ui-architecture`, `react-best-practices` | placement/anatomy + behavioral React rules |
| `client/src/app/**/page.tsx`, `**/layout.tsx`, `**/route.ts` | + `next-best-practices` | RSC boundary / route-handler specific |
| `client/**/*.test.tsx` | `react-testing-library` | in addition to the above |
| `client/src/vendor/ui/**` | *(skip)* | vendored, per CLAUDE.md do-not-touch |
| `server/src/modules/<name>/**` | `onion-architecture`, `fastify-best-practices` | run `enforced.md`'s checklist, not just `SKILL.md` prose |
| `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` | |
| `server/src/db/migrations/**` (new files only) | `drizzle-orm-patterns` | existing migration files here are a hard-rule violation, not a skill review — see below |
| `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | `zod` | + hard rule: both copies must change together (see below) |
| `reviewer-core/**` | `typescript-expert` | no framework skill exists for this package; `zod` too if it touches `reviewer-core`'s own contract types |
| `e2e/**` | `typescript-expert` | thin coverage by design — the report says so explicitly rather than silently running nothing |
| any file matching an auth/secrets/input-handling signal (`req.body`, `process.env`, raw SQL/template-literal queries, file-upload handlers, `LocalSecretsProvider`, JWT/session code) | `security` | heuristic grep over the diff, not a path pattern — see Signals below |
| `*.md`, `.claude/**`, config-only files with no `.ts`/`.tsx` | *(skip)* | no domain skill owns prose/config |

**Signals (not path-based):** the security row and a lighter-weight
`typescript-expert` row (only pulled in when the diff introduces generics,
conditional/mapped types, or `as any`/`@ts-expect-error`, rather than on
every `.ts` file) are matched by grepping the *added* lines of the diff for
keyword patterns, not by directory. This keeps the report from being
dominated by low-value passes on files that are structurally fine but
happen to be TypeScript.

A file can match more than one row (e.g. a new `server/src/modules/reviews/`
route touching a schema change matches both the module row and the schema
row) — every matched skill gets its own pass; passes are not deduplicated
across skills, only across identical (skill, file) pairs.

## Repo-wide hard rules (checked independent of routing)

These come straight from the root `CLAUDE.md` and aren't owned by any
single domain skill, so they're codified directly as a checklist inside
this skill (its own `enforced.md`, same pattern as `onion-architecture`),
always run regardless of which domains matched:

1. **Do-not-touch paths** — diff must not modify `server/clones/**`,
   `server/src/vendor/*`/`client/src/vendor/*` *content* in a way that
   diverges the two copies, or hand-edit an *already-applied* entry in
   `server/src/db/migrations/*` (cross-check against
   `meta/_journal.json`'s existing entries — a new migration file is fine,
   editing one already listed there is `CRITICAL`).
2. **Lockfiles never hand-edited** — if a lockfile (`server/pnpm-lock.yaml`,
   `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
   `e2e/package-lock.json`) changed, confirm it's consistent with a
   `package.json` change in the same diff (a lockfile diff with no
   corresponding manifest change is a smell — flag `HIGH`, not `CRITICAL`,
   since it's sometimes a legitimate re-resolve).
3. **Vendor mirroring** — if `server/src/vendor/shared/**` changed, the
   same logical change must appear in `client/src/vendor/shared/**` (and
   vice versa) — diff both, flag `CRITICAL` if only one side moved.
4. **Test naming / CI split** — any new Postgres-backed test (imports
   testcontainers, hits `container.db` outside a mock) must be named
   `*.it.test.ts`, and no `*.it.test.ts` file may be missing that DB usage
   (the inverse mistake silently breaks the unit/integration CI split) —
   `CRITICAL`, since this is called out in `CLAUDE.md` as silently breaking
   CI.
5. **`REPO_INTEL_ENABLED` / secrets provider regressions** — a diff that
   adds a new secret read must go through `LocalSecretsProvider` with
   `process.env` only as fallback, matching the existing convention; a
   direct new `process.env.*` read for something secret-shaped is `HIGH`.
6. **Hardcoded secrets in the diff** — grep every *added* line (regardless
   of which domain matched, and independent of the signal-based `security`
   pass) for key-shaped strings: `sk-`, `ghp_`/`gho_`/`github_pat_`,
   `AKIA[0-9A-Z]{16}`, generic `api[_-]?key\s*=\s*['"][A-Za-z0-9_\-]{16,}`,
   private-key headers (`-----BEGIN … PRIVATE KEY-----`). Any hit is
   `CRITICAL` unconditionally — this must not depend on routing having
   correctly classified the file as security-relevant first.
7. **Missing test coverage** — a non-test source file changed
   (`*.ts`/`*.tsx` outside `*.test.ts(x)`/`*.it.test.ts`) with no
   corresponding test file touched anywhere in the same diff → `MEDIUM`.
   Cheap signal, not a hard block (plenty of legitimate changes have no new
   test — a rename, a comment, a type-only edit) but worth surfacing since
   no domain skill owns "did you test this."

## Execution model

0. **Fast-fail gates, before any fork runs.** For each package with changed
   files (`client/`, `server/`, `reviewer-core/`, `e2e/`), run its own
   `pnpm lint` and `pnpm typecheck` (and `mcp__ide__getDiagnostics` where
   the IDE tool is available, since it's near-instant and needs no process
   spawn). A failure here is reported as `CRITICAL` immediately and the run
   stops — there's no value in spending fork budget on a semantic
   architecture review of a file that doesn't compile.
1. Main agent (or the invoking skill session) computes the diff scope and
   file list, then evaluates the routing table to get a list of
   `(skill, file-subset)` pairs, skipping any pair whose file-subset is
   empty.
2. Each pair becomes one `Agent` call with `subagent_type: "fork"` (forks
   are unrestricted, unlike `Workflow`, and share this session's cache) —
   the fork is told: "Load skill `<X>` via the Skill tool, then review only
   these files/hunks against it, report findings as JSON:
   `{severity: critical|high|medium, file, line, rule, summary}`." Forks
   run in parallel since they're independent.
3. The hard-rule checklist (including the secrets grep and test-coverage
   check) runs inline in the main agent (cheap, mostly `grep`/`git diff
   --stat`), not as a fork.
4. **Verify pass on criticals only.** Before finalizing, every finding
   tagged `CRITICAL` (from a domain fork or a hard rule) gets one more
   fork: "here's the full file and the claim — is it actually true?" —
   the same review → verify shape `code-review` already uses. Only a
   finding that survives this pass can flip the verdict to `BLOCKED`; one
   that doesn't survive is downgraded to `HIGH` and marked "flagged, not
   verified" rather than silently dropped. `HIGH`/`MEDIUM` findings skip
   this step since they're non-blocking either way. This exists
   specifically so the hard gate isn't disabled the first time it's wrong.
5. Main agent aggregates all surviving findings + the hard-rule results
   into one report, sorted `critical` → `high` → `medium`, grouped by
   file.
6. Optionally chain into the existing `code-review` skill for one more
   generic-correctness pass over the same diff, merged into the same
   report under its own heading — not required for v1, called out as a
   follow-up.

Using per-domain forks (rather than one giant pass) keeps each review
focused on files that skill actually knows about, avoids one skill's
prompt drowning out another's, and keeps token usage roughly linear in
diff size rather than in skill count × diff size.

### Incremental re-review

A `BLOCKED` run is usually followed by a small fix and a re-run over
almost the same diff. Cache each `(skill, file-content-hash) → verdict`
pair from the last run inside `.claude/state/pr-self-review.json`
alongside the top-level verdict. On the next invocation, only re-fork for
files whose content hash changed since the cached entry (or that are new
to the diff); carry forward cached pass/fail results for everything else.
This keeps iterating on a review no more expensive than the first pass
regardless of how many domains matched, and mirrors the caching behavior
`Workflow`'s `resumeFromRunId` already gives for free — worth confirming
whether this skill should just delegate to that mechanism instead of
hand-rolling its own cache, once the skill actually uses `Workflow` rather
than bare forks.

## Severity model & blocking

- Each skill/pair is asked to tag findings using **that skill's own
  existing severity vocabulary** — most already tag `CRITICAL`/`HIGH`/
  `MEDIUM` (`security`, `onion-architecture`, `frontend-ui-architecture`).
  This skill doesn't invent a new scale, it just standardizes the field
  name across passes.
- **Any single `CRITICAL` finding (from a domain pass or a hard rule) that
  survives the verify pass (Execution model, step 4) fails the whole
  review.** The report ends with a clear verdict line:
  `BLOCKED — N critical finding(s), do not open the PR` or
  `PASS — N high, M medium (non-blocking)`.
- On `BLOCKED`, the skill does not run (and instructs the agent not to run)
  `gh pr create` on the user's behalf until either the finding is fixed and
  the skill is re-run, or the user explicitly overrides (see next
  paragraph) — this is the soft/manual enforcement layer.
- **Verdict file** (for the hard hook layer): on every run, write
  `.claude/state/pr-self-review.json` — `{diffHash, verdict, findings,
  timestamp}`, where `diffHash` is a hash of the exact scope diffed. The
  `PreToolUse` hook (step 3 under Trigger points) reads this file, and
  denies `gh pr create` unless `diffHash` matches the *current* diff and
  `verdict == "PASS"`.
- **Override:** a `CRITICAL` finding can be a false positive. Rather than
  silently letting the agent bypass its own gate, the override is an
  explicit user action: re-running with `/pr-self-review --acknowledge
  <rule-id>` records the acknowledgement in the verdict file so the hash
  check still requires a fresh run, but that specific finding no longer
  fails the verdict. This keeps the block real (can't just ask the agent
  nicely to skip it) while not permanently wedging a legitimate edge case.

## Output shown to the user

A single Markdown report (chat text, not a file) with:

```
## PR Self-Review — BLOCKED (2 critical)

### server/src/modules/reviews/routes.ts:42 [CRITICAL] onion-architecture
Route handler calls `container.db` directly; no repository.ts exists for
this module. → server/src/modules/onion-architecture SKILL.md §2

### server/src/db/migrations/0007_x.sql [CRITICAL] hard-rule
Edits an already-applied migration (present in meta/_journal.json) instead
of adding a new one.

### client/.../PRRow.tsx:118 [HIGH] react-best-practices
...

--- 
Skills run: onion-architecture, fastify-best-practices, frontend-ui-architecture,
react-best-practices, security (2 files matched signal), hard-rules
Skills skipped (no matching files): drizzle-orm-patterns, postgresql-table-design,
zod, typescript-expert, react-testing-library
```

Listing skipped skills is deliberate — makes the routing decision
inspectable instead of a black box.

**On `PASS`, also hand back a draft PR description** — the skill already
has the full diff and its domain classification in hand, so it can produce
a ready-to-paste summary (grouped by the same domains used for routing:
"Frontend: …", "Backend: …", "Schema: …") rather than making that pure
review overhead. This isn't posted anywhere automatically (opening/editing
the actual PR stays a separate, confirmed action) — it's just handed to
the user/agent to paste into `gh pr create --body`.

## Files

```
.claude/skills/pr-self-review/
├── SKILL.md        # workflow: compute scope → route → fan out → aggregate → verdict
├── routing.md       # the path-pattern/signal → skill table, kept separate so it's easy to update as new skills/packages are added
├── enforced.md       # the repo-wide hard-rule checklist (CLAUDE.md-derived), run every time regardless of routing
└── examples.md      # a worked example: a sample diff, the routing decision it produces, and the resulting report
```

No `README.md`/sources file — unlike `frontend-ui-architecture`, this skill
isn't grounded in external industry sources, it's a mechanical process
skill over this repo's own conventions and its own sibling skills.

### Frontmatter

```yaml
---
name: pr-self-review
version: 1.0.0
description: "..."   # see Triggering below
---
```

### Triggering (the description)

Needs to fire both on explicit invocation and proactively before PR
creation, without hijacking every commit. Shape: "Routes the local diff
across all four packages to the matching domain skills (frontend-ui-
architecture, onion-architecture, security, etc.), plus this repo's own
CLAUDE.md hard rules, and blocks on any critical finding. Use before
opening a PR, before `gh pr create`, when asked 'is this ready to merge/
ship', or via `/pr-self-review`. Does not replace `code-review` (generic
bug-hunting) or `pnpm lint`/`typecheck` — run those too."

## Changes to existing files

1. **`.claude/skills/README.md`** — add a catalog row, probably its own
   "Meta" scope column value since it's not frontend/backend/full-stack
   like the others:
   `| pr-self-review | Meta | Routes local diff to matching skills + CLAUDE.md hard rules, blocks merge on critical findings |`
2. **`.claude/settings.json`** — *separate follow-up*, not bundled into the
   initial skill creation: add the `PreToolUse` hook for `gh pr create`
   once the skill itself is validated standalone. Needs the `update-config`
   skill and its own sign-off since it changes enforced harness behavior,
   not just add advisory guidance.
3. **No change** to any of the 13 existing domain skills — `pr-self-review`
   only *reads* them (via the Skill tool inside each fork), it doesn't
   modify their content or severity conventions.

## Open decisions to confirm before building

- **Default-branch detection** — assumed `main` (matches `git status`
  above); confirm no other integration branch is used for PRs.
- **Hook strictness** — plan defaults to hard-blocking `gh pr create`
  itself once verdict is stale/failing; an alternative is to only block
  `git push` to a remote branch with an open-PR association, leaving
  `gh pr create` itself ungated. Hard-blocking `gh pr create` is simpler
  and matches "before a PR is opened" literally, so that's what's proposed
  here.
- **False-positive cost** — the override mechanism (`--acknowledge
  <rule-id>`) is proposed specifically to keep the hard hook from being
  something the team routes around by disabling it entirely the first time
  it's wrong. Worth a gut-check once the skill has run a few times for
  real.

## Verification (once built)

1. `head -6 .claude/skills/pr-self-review/SKILL.md` — frontmatter parses.
2. Seed a synthetic diff that touches one file per routing row (including
   one deliberately-broken hard rule, e.g. hand-edit an already-applied
   migration) and confirm the routing table + hard-rule check both fire
   and the verdict is `BLOCKED`.
3. Fix the diff, re-run, confirm verdict flips to `PASS` and the skipped-
   skills list matches expectations, and that the run reused cached
   verdicts for the files that didn't change (incremental re-review).
4. Confirm a diff touching only `*.md`/`.claude/**` produces "no domain
   skill matched" rather than running everything or erroring.
5. Introduce a deliberate lint error alongside an unrelated architecture
   violation — confirm the run stops at the fast-fail gate (step 0) and
   never spends fork budget on the domain passes.
6. Plant an obviously-fake but key-shaped string (e.g. a fake `sk-`-
   prefixed token) in a file that matches no other routing row — confirm
   the secrets hard rule still catches it as `CRITICAL`.
7. Seed a finding that's a known false positive (references a real
   confidence-check case from one of the domain skills) — confirm the
   verify pass downgrades it to `HIGH` instead of blocking.
8. Once the hook lands: confirm `gh pr create` is denied with a stale/
   missing verdict file, and succeeds right after a fresh `PASS` run.
