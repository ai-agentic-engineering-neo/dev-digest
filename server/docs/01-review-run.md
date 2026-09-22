# The review run, end to end

What happens between `POST /pulls/:id/review` and a finding row in Postgres.

[`../README.md`](../README.md) is the map: the request/DI flow, the API list and the environment
table live there and are not repeated here. This file covers the parts of a run that reading any
one file does not reveal — which prompt slots are actually filled, what the grounding gate does
and does not promise, where the stored score comes from, and what a finished run leaves behind.

## The path a run takes

| Stage | Where |
|---|---|
| Route validates `:id`, rate-limited to 10/min because one call can fan out to several LLM runs | `server/src/modules/reviews/routes.ts:27` |
| `ReviewService.runReview` resolves PR + repo, then creates one `agent_runs` row per target agent | `server/src/modules/reviews/service.ts:103` |
| `RunExecutor.executeRuns` loads the diff once, then loops the agents | `server/src/modules/reviews/run-executor.ts:98` |
| `runOneAgent` resolves the provider, builds repo-intel context, calls the engine | `server/src/modules/reviews/run-executor.ts:139` |
| `reviewPullRequest` assembles the prompt, calls the model, reduces, grounds, scores | `reviewer-core/src/review/run.ts:123` |
| Back in the server: persist the review, the findings, the run row and the trace | `server/src/modules/reviews/run-executor.ts:218` |

**The response arrives before the review begins.** `runReview` creates the `agent_runs` rows, hands
them to the executor with a bare `void` — deliberately un-awaited — and returns
(`server/src/modules/reviews/service.ts:133`). The handler therefore answers in milliseconds, while
the run it describes has not made its first model call. Two consequences follow, and both surprise
people reading the route in isolation:

- The `reviews` array in the response is `[]` **always**, not "usually" or "when the run is fast"
  (`server/src/modules/reviews/service.ts:137`). It is a vestigial field; the run ids beside it are
  the payload that matters. A caller waiting for findings in this response waits forever.
- Progress exists only on the SSE stream at `GET /runs/:id/events`
  (`server/src/modules/reviews/routes.ts:48`), which replays the run's buffer before going live, so
  a client that subscribes late still sees the whole run.

The diff is loaded once for all agents in the batch, not once per agent
(`server/src/modules/reviews/run-executor.ts:98`). That is a deliberate saving, and it has a blast
radius to match: a diff that fails to load fails *every* queued run in the batch through `failAll`
(`server/src/modules/reviews/run-executor.ts:75`), each with its own persisted failure row.

## What the model is actually told

`PromptParts` declares nine slots (`reviewer-core/src/prompt.ts:39`). The server fills six of them:

| Slot | Filled | From |
|---|---|---|
| `system` | always | the agent's stored system prompt |
| `diff` | always | the batch's single loaded diff |
| `task` | always | the task line plus a blast-radius note (`server/src/modules/reviews/run-executor.ts:185`) |
| `prDescription` | when the PR has a body | `pull.body`, truncated to 4000 characters (`reviewer-core/src/prompt.ts:37`) |
| `repoMap` | when repo-intel is on *and* the repo is indexed | `buildRepoMapDigest` (`server/src/modules/reviews/run-executor.ts:182`) |
| `callers` | same condition | `buildCallersDigest` (`server/src/modules/reviews/run-executor.ts:175`) |
| `skills` | **never** | — |
| `memory` | **never** | — |
| `specs` | **never** | — |

The last three are not passed as `null`; they are absent from the call object entirely
(`server/src/modules/reviews/run-executor.ts:191-213`). `assemblePrompt` omits a section whose slot
is empty (`reviewer-core/src/prompt.ts:109-114`), so the model never sees a `## Skills / rules`,
`## Relevant memory` or `## Project context` heading at all — it is not shown an empty section, it
is shown no section.

**The consequence is the shape of what the reviewer can catch.** It is given the repository's
*structure* — a ranked skeleton of symbols and the callers of what changed — and none of the
repository's *rules*. It cannot flag a violation of a convention written in a `CLAUDE.md`, a spec
under `specs/`, or a curated memory item, because nobody shows it any of them. Findings that look
like missing project knowledge are usually this, not a weak model. The slots are not a gap in the
engine: `reviewer-core` accepts all nine and renders them correctly, and the wiring on the server
side is what has not been built (see `reviewer-core/CLAUDE.md` § *Use when*).

Two places record that emptiness, and they are recorded differently:

- A successful run stores the real assembly, where an unfilled slot became `null` on the way in
  (`reviewer-core/src/prompt.ts:131-133`), alongside `memory_pulled: []` and `specs_read: []`, which
  are hardcoded literals rather than measurements (`server/src/modules/reviews/run-executor.ts:282`).
- A run that failed before assembly has no assembly to store, so the trace is synthesised with
  `skills: null, memory: null, specs: null` and an empty user message
  (`server/src/modules/reviews/run-executor.ts:429`). A `null` there means "the run died early",
  not "the slot was offered and empty" — the two are indistinguishable in the stored document.

## The grounding gate

Every candidate finding passes through `groundFindings` once, after the partials are reduced and
before anything is scored or stored (`reviewer-core/src/review/run.ts:197`). It runs on the merged
set, so both review strategies share exactly one gate rather than each implementing its own.

A finding is dropped for one of two distinct reasons, and the trace keeps them apart:

1. **Its file is not in the diff at all** (`reviewer-core/src/grounding.ts:61`) — reason recorded as
   `file '…' not present in diff`.
2. **Its lines intersect no hunk** in that file (`reviewer-core/src/grounding.ts:73`) — reason
   recorded as `lines N-M do not intersect any diff hunk in '…'`.

The second check runs against a set of new-side line numbers built per file, falling back to the
hunk's declared range when a hunk carries no explicit line numbers
(`reviewer-core/src/grounding.ts:24-39`).

**Four kinds skip the line check.** `secret_leak`, `lethal_trifecta`, `phantom` and `hook` are
whole-file scanners, so they are kept on the file being present in the diff, without their lines
having to meet any hunk (`reviewer-core/src/grounding.ts:16` and `:66`). The root
[`CLAUDE.md`](../../CLAUDE.md) states the rule in this two-part form deliberately: the shorter
"a finding citing no real diff line is dropped" promised a guarantee the gate does not give, since a
`secret_leak` pointing at an untouched line survives it.

Dropped findings are announced, not swallowed: each one is emitted as an `info` event with its
reason (`reviewer-core/src/review/run.ts:199-201`) and the surviving ratio is emitted as a result
(`:202`), so a run that quietly discards half the model's output still says so in its own log.

## The score is not the model's

The model reports a `score` in its structured output, and it is discarded. What the row carries is
recomputed from the findings that survived grounding (`reviewer-core/src/review/run.ts:208`):

```
score = clamp(100 − Σ penalty(finding), 0, 100)
```

with three weights, and no others (`reviewer-core/src/review/reduce.ts:13`):

| Severity | Penalty | One such finding scores |
|---|---|---|
| `CRITICAL` | 35 | 65 |
| `WARNING` | 12 | 88 |
| `SUGGESTION` | 3 | 97 |

Two properties follow from computing it this way. The score can never contradict the findings
listed beneath it, because it is a function of exactly that list. And a finding dropped by grounding
raises the score, since it never enters the sum.

**The run log prints a different number from the one that is stored.** The `Reduced to N finding(s);
verdict=…, score=…` line reports `merged.score` — the model's own figure, emitted *before* the gate
runs (`reviewer-core/src/review/run.ts:193`). The stored score is computed eleven lines later, from
the survivors (`:208`). In the map-reduce path the logged number is stranger still: `reduceReviews`
averages the partial scores across chunks (`reviewer-core/src/review/reduce.ts:50-52`), producing a
mean of self-reported numbers that is then thrown away. When a run's log and the PR page disagree
about the score, neither is wrong — they are reporting different quantities, and only the page's is
derived from anything.

## What a finished run leaves behind

Four write targets, in order (`server/src/modules/reviews/run-executor.ts:218-290`):

| Target | Carries |
|---|---|
| `reviews` | verdict, summary, the recomputed score, the model name, the agent and run ids (`server/src/modules/reviews/repository/review.repo.ts:11`) |
| `findings` | one row per surviving finding (`server/src/modules/reviews/repository/review.repo.ts:29`) |
| `pull_requests` | `last_reviewed_sha`, stamped so the list can tell reviewed from needs-review from stale (`server/src/modules/reviews/run-executor.ts:235`) |
| `agent_runs` | duration, tokens, cost, finding count, grounding summary, score, blocker count (`server/src/modules/reviews/run-executor.ts:244`) |
| `run_traces` | one jsonb document: config, stats, prompt assembly, tool calls, raw output, the full event log (`server/src/modules/reviews/run-executor.ts:257`, saved at `:289`) |

Three things are worth knowing about that write:

- **The score is stored twice**, on the review row and on the run row (`server/src/modules/reviews/run-executor.ts:227` and
  `:252`). Both are the recomputed number, so they agree today; a change to one that misses the
  other would be invisible until two screens disagreed.
- **The blocker count is not the model's verdict.** It is recounted from the surviving findings
  against the agent's own `ci_fail_on` threshold (`server/src/modules/reviews/run-executor.ts:241`,
  `reviewer-core/src/output/to-review.ts:48`), so the signal the timeline colours on stays
  deterministic even if the model calls a critical finding an approval.
- **Two fields of a finding do not survive the write.** The model's own `id` is discarded and
  Postgres generates its own, and `evidence` — the per-component trifecta locations, which the
  contract carries (`server/src/vendor/shared/contracts/findings.ts:61`) — has no column and is not
  inserted (`server/src/modules/reviews/repository/review.repo.ts:38-51`). A lethal-trifecta
  finding keeps its `trifecta_components` list but loses the file and line behind each component;
  they remain only inside the trace's `raw_output`.

## Why the trace and the row disagree about null

The same quantity is declared two ways, and it is not an oversight:

- `RunStats.cost_usd` is `nullish` (`server/src/vendor/shared/contracts/trace.ts:65`)
- `RunSummary.cost_usd` is `nullable` (`server/src/vendor/shared/contracts/trace.ts:106`)

`RunStats` is read out of the `run_traces` jsonb document. A document written before a field existed
simply has no key, so the contract has to admit `undefined` as well as `null`. `RunSummary` is
projected from `agent_runs` columns, which the server always serialises — a column that was never
priced is `null`, never missing.

The rule that follows: a field added to anything stored inside the trace document must be `nullish`,
because every document already written lacks it; a field added as a column may be `nullable`.
Making the pair symmetrical for tidiness type-checks and then lies about every trace older than the
field.

## What is not here

| For | Go to |
|---|---|
| The DI container, adapters, module boundaries, the API list, env vars | [`../README.md`](../README.md) |
| What an agent's system prompt should say, and response-shape rules | [`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md) |
| The engine's own internals: assembly order, injection guard, output conversion | [`../../reviewer-core/README.md`](../../reviewer-core/README.md) |
| The CI runner's path to the same engine | `reviewer-core` consumers outside this package |
| Repo-intel: indexing, ranking, the callers digest, blast radius | [`../src/modules/repo-intel/README.md`](../src/modules/repo-intel/README.md) |
| How findings are rendered, triaged and filtered | the client package |
| Choosing between unit, integration and e2e coverage for a change here | [`../../TESTING.md`](../../TESTING.md) |
