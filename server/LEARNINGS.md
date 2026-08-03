# server — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

Covers `server/` and its submodules, including
`server/src/modules/repo-intel` (no separate file for it).

## What Works

### 2026-07-28 — per-run cost is already computed; the pipeline just drops it

`reviewer-core` computes cost end-to-end with no extra API calls:
`OpenRouterProvider.completeStructured` (`reviewer-core/src/llm/openrouter.ts`)
asks OpenRouter for `usage: { include: true }`, prefers OpenRouter's own
`usage.cost`, and falls back to the injected `estimateCost` (wired from
`platform/price-book.ts` → `adapters/llm/pricing.ts` in `container.ts`).
`reviewPullRequest` then sums it into `ReviewOutcome.costUsd`.

Commit `d45ab0d` removed only the *persistence* of that value, not its
computation — `run-executor.ts` was destructuring `const { tokensIn,
tokensOut, grounding } = outcome;` and silently discarding `costUsd`. So
surfacing run cost is a wiring job (schema column + `completeAgentRun` +
contracts), never a provider/pricing job. Check what `ReviewOutcome` already
carries before adding anything to the LLM path.

Caveat from `reviewer-core/src/review/run.ts`: on the map-reduce strategy
`costUsd` collapses to `null` if *any* chunk lacks a cost — so null means
"unknown", and must not be rendered as $0.

## What Doesn't Work

## Codebase Patterns

### 2026-07-28 — list endpoints denormalize per-PR data with IN-query + JS grouping, not SQL joins

`GET /repos/:id/pulls` (`modules/pulls/routes.ts`) does not join `reviews` or
`agent_runs`. It collects `prIds`, runs one `inArray(...)` query ordered
`desc(createdAt/ranAt)`, and takes first-seen-per-PR in a JS `Map` as "the
latest". Follow that shape when adding another per-PR column (I added the
`latestRunByPr` block for tokens/cost this way).

Non-obvious part: the newest `agent_runs` row for a PR is frequently *not*
`done` (still running, or failed). Gate on `status === 'done'` when building
the map, otherwise the list shows a half-finished run's zeroed tokens — or
worse, silently falls through to an older run's numbers as if they were
current.

### 2026-07-28 — `vendor/shared` copies have already drifted

Diffing `server/src/vendor/shared` against `client/src/vendor/shared` shows
they're not identical: server has `sessionId`, the `openrouter` provider id,
`CommitFile`/`CommitFilesPayload` that client's copy lacks. There is no sync
script — editing a shared contract in one copy does not propagate to the
other; the other package keeps stale types and still type-checks clean.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-07-28 — `.nullable()` on a shared contract breaks every fixture that builds it

Adding `cost_usd: z.number().nullable()` to `RunStats`/`RunSummary`
(`vendor/shared/contracts/trace.ts`) makes the *key required* — value may be
null, presence may not. Every object literal building one of those types
stops compiling until the field is added, including test fixtures far from
the change (`server/test/contracts.test.ts` `RunTrace` fixture, client's
`RunHistory.test.tsx` / `RunTraceDrawer.test.tsx`).

Use `.nullable()` when siblings are required-but-nullable (`RunStats`,
`RunSummary`); use `.nullish()` for `PrMeta`-style optional-tolerant types
where `score`, `opened_at` etc. are already `.nullish()`. Picking the wrong
one is not caught by tests — it shows up as a spray of TS2741/TS2719 errors
in unrelated files, or as a field that silently goes missing from responses.

### 2026-08-03 — a `*/` inside a JSDoc comment's own text silently truncates the comment, and the cascade of errors points nowhere near the cause

Writing `.claude/skills/*/SKILL.md` or `` `*/SKILL.md` `` inside a `/** ... */`
block (describing a glob path) closes the comment at that literal `*/` —
whatever the comment meant to say next becomes real code. `tsc` doesn't error
at that line; it errors dozens of lines later, wherever the resulting
stray-identifier soup finally produces something structurally invalid
(`TS1127 Invalid character`, `TS1443 Module declaration names...`, `TS1161
Unterminated regular expression`). The line numbers in the diagnostic are
nowhere near the actual bug.

Found in `modules/skills/helpers.ts` (written by an agent, describing
`SKILL.md`-matching glob patterns in its own doc comments) — two separate
occurrences, ~30 and ~90 lines before their respective error clusters started.
The fix is always the same: grep the file for `\*/` and check whether every
hit is an *intentional* comment terminator (`grep -n '\*/' file.ts`, read each
one). When a comment must describe a path containing `*/`, rephrase around it
("matches `SKILL.md` at any depth") rather than writing the literal glob.

### 2026-08-03 — two independent enabled-gates, not one: don't let "disabled" collapse to a single flag

Skills (L02) are gated twice: `skills.enabled` (workspace/vetting — is this
skill trustworthy at all) and `agent_skills.enabled` (per-agent — does *this*
reviewer use it). A skill reaches a prompt only when both are true, and they
must stay genuinely independent columns, not one derived from the other:
disabling a skill workspace-wide must silently drop it from every agent's
prompt while every agent's own checkbox stays visibly checked (so re-enabling
the skill instantly restores every agent that had it), and toggling the
per-agent gate off must NOT delete the `agent_skills` row — deleting it loses
`order`, and re-linking would append the skill to the end of the prompt instead
of restoring its place. `AgentsRepository.setSkillEnabled` upserts in place for
exactly this reason; `AgentsRepository.enabledSkills` ANDs both flags in one
query rather than checking them in two places that could drift apart.

### 2026-08-03 — findings attribution from `run_skills` is RUN-level, not skill-level, and the UI must say so

`run_skills` records which skills were injected into *a run's* prompt, not
which skill produced *which finding* — the model doesn't (yet) name a skill
per finding. So a run that injected four skills has all of its findings
counted toward all four skills' stats. This over-counts by design, and
`SkillsRepository`'s `findingCounts`/`findingsByCategory` comments call it out
explicitly so nobody "fixes" the over-count into a false precision the data
doesn't support. The Stats tab's panel title reflects this too: "Findings in
runs using this skill", never "caused by". If per-finding attribution is ever
wanted, it needs the `Review` schema to carry a skill reference per finding —
a real schema change, not a stats-query fix.

## Session Notes

## Open Questions
