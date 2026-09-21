# Insights — server

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

### Checking the parent's workspace is not checking the child's (2026-09)

`POST /agents/:id/skills` verified that the AGENT belonged to the caller's workspace and
then linked whatever `skill_id` the body carried; `linkedSkills` joined `agent_skills` to
`skills` with no workspace filter at all. Every other query in the module is scoped, which
is exactly why it read as safe. A caller could attach another workspace's skill to their
own agent and read its body back — in the editor tab, and in the next review prompt.
Found by the `security` skill during self-review, not by any test.

**Rule:** when an endpoint links resource A to resource B, scope BOTH — validate the
incoming ids against the workspace on write, and scope the read-back join too, so a stray
row can never be read even if one exists (`src/modules/agents/service.ts:205`, commit
`933c65c`)

### A base agent prompt that already teaches the skill's checks hides the skill (2026-09)

The control experiment was meant to show a reviewer missing a defect without its skills
and catching it with them. It did not: the Test Quality agent found the uncovered branches
on PR #483 with skills OFF (2 findings, verdict `comment`), because the prompt itself told
it to look for untested branches. Skills still changed the output — 3 findings anchored to
the SOURCE file with per-branch line ranges and verdict `request_changes` — but that is
"vaguer vs sharper", not "missed vs caught".

**Rule:** keep the split honest — the agent prompt owns role, stack and reporting rules;
the skill owns WHICH checks to run. Any check listed in both makes the skill's effect
unmeasurable (`src/db/seed-prompts.ts:294`, `src/db/seed-skills.ts`)

## Codebase Patterns

### Reuse the existing severity tally instead of duplicating it (2026-09-18)

`rollupSeverities` (`server/src/modules/pulls/status.ts:23`) already tallies `{severity}[]` into `{critical, warning, suggestion}` — it was written for the PR-list FINDINGS column but never wired into a route (`status.ts:1-11` docblock describes exactly this feature). Before adding a new severity-counting function, grep `src/modules/pulls/` for existing pure helpers — this one had its own passing unit test (`test/pulls-status.test.ts`) and sat unused.

**Rule:** `findingsCountsByPr` (`server/src/modules/pulls/findings-counts.ts`) groups rows to "each agent's latest review" and then calls `rollupSeverities` for the leaf count, instead of reimplementing the CRITICAL/WARNING/SUGGESTION branching a second time. (`server/src/modules/pulls/findings-counts.ts:1-50`, `server/src/modules/pulls/status.ts:23-31`)

### PR-list cost changed from "latest batch" to "sum of all runs" (2026-09-18)

The original `latestBatchCostByPr` (deleted this session) summed only the newest "Review all" batch per PR — a re-run's older cost was dropped entirely. The homework criterion for this column defines cost as the PR's cumulative review spend, which is a different aggregation, not a bugfix of the old one: it's a deliberate semantic change (a PR reviewed 3 times now shows 3x the single-run cost, not the latest run's cost).

**Rule:** if a future task touches the COST column again, check `total-cost.ts`'s docblock before assuming "latest batch" — that rule was intentionally replaced, not preserved. (`server/src/modules/pulls/total-cost.ts:1-9`, `server/test/total-cost.test.ts`)

### A run has TWO trace builders, and the failure path is the one that rots (2026-09)

A successful run builds its `RunTrace` inline in `run-executor.ts`; a failed one goes
through `traceFromBuffer`, which hardcodes the prompt slots it does not have. Adding the
skills slot to the success path left the failure path writing `skills: null`, so a failed
run's trace claimed the prompt had no skills while its own log line said two were
attached — misleading exactly when the trace is what you read. A third builder,
`platform/trace-builder.ts`, exists for non-LLM detectors.

**Rule:** adding a prompt slot means updating every trace builder, and anything the
failure path needs must be hoisted above the `try` (`src/modules/reviews/run-executor.ts:446`,
commit `96a60d0`)

## Tool & Library Notes

### dependency-cruiser `exclude` silently deletes edges to npm packages (2026-09)

While building the onion-architecture rules, an `exclude` pattern containing `node_modules` (and an unanchored `(^|/)dist(/|$)`, which also matches `node_modules/graphology/dist/...`) removed those modules from the graph entirely, not just from traversal. So every rule targeting an SDK package (`sdk-only-in-adapters`, `no-db-outside-infra` → `drizzle-orm`) reported zero violations, even though real ones existed. No error, just a false green.

**Rule:** stop recursion into npm with `doNotFollow: { path: 'node_modules' }`, never with `exclude`, and anchor `exclude` to the package's own output (`^dist(/|$)`). After you change the rules, prove each one fires with a temporary violating import before you trust a clean `pnpm arch`. (`server/.dependency-cruiser.cjs:180-185`)

## Recurring Errors & Fixes

### Migration journal corruption (2026-08)

Merging a branch by copying its whole `src/db/migrations/` dir over upstream's — instead of appending — rewrote history: it replaced an existing entry, dropped a later upstream migration, and lost columns from regenerated snapshots. Fresh databases crashed; already-migrated ones didn't, masking the break in some CI lanes.

**Rule:** never copy the migrations dir wholesale across branches. Always regenerate with `pnpm db:generate` and resolve journal conflicts by appending, never replacing. (`server/src/db/migrations/`, commit `2006964`.)

> **2026-09-18 correction:** sharper pointer — the actual file that got clobbered is `server/src/db/migrations/meta/_journal.json` (its `entries` array is the append-only history; a wholesale copy silently renumbers/replaces entries there).

## Session Notes

_No entries yet._

## Open Questions

### The two `vendor/shared` copies are already out of sync in files this session didn't touch (2026-09-18)

`diff -r server/src/vendor/shared client/src/vendor/shared` shows real drift in `adapters.ts`, `contracts/eval-ci.ts`, `contracts/knowledge.ts`, `contracts/productionize.ts`, and `contracts/trace.ts` — e.g. server's copy has an `'openrouter'` provider variant and an `AgentVersion`/`AgentManifest` shape client's copy lacks entirely. `platform.ts` (the file this session edited) is confirmed in sync; the drift predates this session and is unrelated to the `findings_counts`/cost work.

**Not fixed here** — reconciling it is a separate, larger change (unclear which side is canonical for each divergent symbol) and out of scope for this PR. Flagging so the next session doesn't assume "both copies in sync" without checking the specific file it's about to touch.

> **2026-09-21 correction:** `contracts/knowledge.ts` is now reconciled — the client copy
> was a strict subset (missing `AgentVersionConfig`/`AgentVersion` and several comments),
> so the server's was copied over it and the two are byte-identical (commit `2311b4f`).
> `pr-self-review`'s `guards.sh` treats ANY drift as blocking, so this surfaces on every
> PR now. The other files listed above are still unreconciled.
