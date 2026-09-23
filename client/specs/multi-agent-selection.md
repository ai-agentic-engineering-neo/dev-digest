# Multi-agent selection for Run Review

Status: planned (2026-09-23).

Let a user run **one, two, several or all** agents on a pull request from a
single Run Review menu, instead of today's "exactly one, or all enabled".

## Goal

On the PR detail page, **Run Review** opens a picker, not a list of actions:

```
⚠ Already merged — review is informational        (only when merged/closed)
─────────────────────────────────────────────
PICK AGENTS TO RUN                  Select all
 [x] Test Quality Reviewer          gpt-4.1
     Checks test coverage, corner cases…
 [ ] API Contract Reviewer          gpt-4.1 · disabled
     Detects breaking API changes…
 [x] Security Reviewer              gpt-4.1
     Flags secrets, injection…
─────────────────────────────────────────────
      [ Run multi-agent review (2) ]
 ⚙ Configure agents…
```

Ticking boxes does not close the menu. One footer click starts one request that
fans out to the selected agents, producing one `agent_runs` row each — exactly
what "run all" already does today, just with an explicit target list.

Enabled agents are **pre-checked** when the menu opens, so "run everything"
stays a single click.

## Why the server barely changes

`ReviewService.runReview()` and `RunExecutor.executeRuns()` already accept an
array of targets and loop over it — multi-agent execution has always been there.
The only thing forcing "one or all" is `resolveTargets()`
(`server/src/modules/reviews/service.ts:46`), which understands `agentId` **or**
`all: true` and nothing in between.

So the server delta is: `agentIds?: string[]` on the `RunRequest` contract, a
`normalizeAgentIds` pure helper, a new first branch in `resolveTargets`, and an
`AgentsRepository.listByIds`. No schema migration, no new route, no change to
how runs execute.

## Decisions

### `Select all` replaces `Run all enabled agents`

The menu becomes purely a picker: there is no longer a one-click "run all" row.

**Rejected alternative:** keep `Run all enabled agents` above the checkbox list.
It preserves today's fastest path, but it puts two controls with *different
semantics* on the same menu — the row means "whatever the server considers
enabled", the boxes mean "these exact ids" — and they visibly disagree the
moment a user unticks one box while the row still says "all". `client/INSIGHTS.md`
already records this exact lesson from the severity filter (2026-09-23): two
controls bound to one piece of state read as a bug, however sound the argument
for each on paper.

Pre-checking the enabled agents recovers the lost click, so the fastest path
costs nothing.

### `all: true` stays in the contract

The wire still accepts `agentId` and `all`; the new UI simply stops sending
them. They are free to keep, they do not break any existing caller, and `all`
carries a meaning the id list cannot express: *"whatever is enabled at the time
the server reads it"* — which is what a future scheduled/CI trigger wants.

### The vendored `Dropdown` is not used, and not extended

`client/src/vendor/ui/kit/Dropdown.tsx:12-15` calls `onClose()` after **every**
item click, and `DropdownItemDef` (`kit/types.ts:5-16`) has no checked, no
disabled and no checkbox concept. A menu that must stay open while boxes are
ticked cannot be built from it.

**Rejected alternative:** add `checkbox`/`keepOpen` to `DropdownItemDef` and
teach `Dropdown` about selection. `src/vendor/ui` is **do-not-touch** per
`client/CLAUDE.md` — it is a hand-synced copy, not the source of truth, so the
edit would be silently lost on the next sync and would fork the primitive for
every other caller.

Instead `RunReviewDropdown` renders its own popover, reusing `Dropdown`'s
mechanics (relative wrapper, absolute panel, mousedown-outside close) and its
design tokens (`--bg-elevated`, `--border-strong`, `--shadow-modal`) so it stays
visually identical to every other menu in the app.

### Selected agents run regardless of `enabled`

Picking an agent explicitly runs it even if it is disabled — preserving today's
behaviour, where clicking a disabled agent's row runs it (`getById` has no
enabled filter). `enabled` governs what is *pre-checked* and what `all: true`
resolves to, not what a user is allowed to pick.

### Execution stays sequential

`run-executor.ts` keeps its `for…of await` loop. Running the selection
concurrently would be faster in wall-clock, but it touches the shared pre-work
and `RunLogger` fan-out, per-agent error isolation, and provider rate limits —
a much larger change than the feature needs. The UI therefore does **not** label
the fan-out "parallel".

## Selection state

Local component state (`useState<string[]>`), seeded from the enabled agents
once `useAgents()` resolves. Deliberately **not** in the URL and **not**
persisted: unlike `?severity=`, this is a per-invocation choice, not a view the
user would want to share or return to. After a successful run the menu closes
and the selection resets to the default, so the next open is never silently
pre-loaded with the previous pick.

## Out of scope

- **Per-agent `~16s` / `$0.10` estimates.** Nothing produces them today — the
  `AgentStats` contract (`observability.ts`) has no route and no consumer.
  Deferred deliberately; the agent row reserves its right edge so an estimate
  can slot in without restructuring.
- **Parallel execution** — see the decision above.
- **Persisting the selection** across opens, PRs or sessions.
- **Changing `all: true`'s enabled-only semantics**, or the `enabled` flag's
  meaning in the Agents editor.
- **A cap on how many agents one request may fan out to.** Bounded by the
  workspace's agent count, and execution is sequential; the existing 10/min
  per-route rate limit is unchanged.
