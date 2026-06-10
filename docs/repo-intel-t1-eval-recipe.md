# repo-intel Tier 1 — cross-file recall eval recipe (Deliverable C)

> **Status (2026-06-11):** BLOCKED in this environment — needs `OPENROUTER_API_KEY`
> (or another reviewer LLM key) **and** a reachable Docker daemon. The
> deterministic portion (Deliverable A, no-LLM) RAN here — see
> `server/test/phantom-recall.test.ts` results.
>
> **What this measures (when runnable):** recall delta on the cross-file
> defect class between `REPO_INTEL_ENABLED=false` (BEFORE) and
> `REPO_INTEL_ENABLED=true` (AFTER), same model, same gold-set. Tier 1's two
> reviewer-visible deltas are (a) the phantom-gate that runs **before** the
> model and (b) the `## Callers of changed symbols` section that lands in the
> assembled prompt (reviewer-core/prompt.ts).
>
> The deterministic phantom recall is already locked by Deliverable A; what's
> measured here is whether **giving the LLM caller context** raises recall on
> the cross-file class (breaking-change bugs in shared functions) without
> blowing up precision.

## 0. Why this is the right eval

T1's claim (plan §3, §4): the callers-in-prompt change uplifts the model's
recall on **cross-file** defects — the class where the diff alone doesn't
contain the breakage, but a caller of the changed symbol does. We measure
that claim directly by running the SAME gold-set with `REPO_INTEL_ENABLED`
flipped, on the SAME model, and comparing recall/precision.

The deterministic phantom-gate is NOT measured here — it's an LLM-independent
detector and Deliverable A already pins it at recall=1.0 / precision=1.0 on
the planted bare-identifier class.

## 1. Prerequisites

This recipe runs **inside `apps/server`** (not a pnpm workspace — `pnpm` from
`apps/` won't find the right scripts):

| Requirement                | Why                                                                                                          | How to verify                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Docker (any recent daemon) | `dockerAvailable()` gates all Testcontainers tests. The eval persists cases + runs to Postgres + pgvector.   | `docker info` exits 0                                                  |
| Postgres + pgvector image  | Testcontainers pulls `pgvector/pgvector:pg16` (see `server/test/helpers/pg.ts`).                             | first run downloads it; subsequent runs are cached                     |
| `OPENROUTER_API_KEY`       | reviewer-core uses OpenRouter for the OSS model lane; `runCase` calls `reviewPullRequest()` (eval-harness §6). | `[ -n "$OPENROUTER_API_KEY" ]`                                         |
| (or) `OPENAI_API_KEY`      | alternative — agent's `provider:'openai'` lane.                                                              | `[ -n "$OPENAI_API_KEY" ]`                                             |
| ast-grep `napi` prebuilt   | already installed (`@ast-grep/napi`) — required for the AFTER lane to do anything.                           | `node -e "require('@ast-grep/napi')"` exits 0                          |

In this environment (`apps/server`, 2026-06-11) we have **neither** Docker nor
an LLM key set, so steps 3–5 below cannot execute. Steps 0–2 (gold-set design)
are runnable docs-only.

## 2. Gold-set: cross-file cases (held-out, ~10–15 cases)

The eval-harness `eval_cases` rows carry the gold set. For the cross-file
class, each case is a `(synthetic diff, expected_output)` pair where the
defect needs **caller context** to be flaggable:

- **Breaking change to a shared signature.** Change `rateLimit(req)` →
  `rateLimit(req, opts)` in `src/mw/ratelimit.ts`. Existing callers in
  `src/api/*` still pass one arg. The model can spot this only if the prompt
  shows the caller signatures — that's exactly what `## Callers of changed
  symbols` provides.
- **Removed export.** Delete an exported function in the diff. Caller files
  reference the old name. Without caller context, the model can plausibly
  miss "this still has importers".
- **Renamed exported symbol.** Rename in the changed file; the diff itself
  looks clean (export renamed, callers untouched).
- **Semantically-narrowed return type.** Signature unchanged, return type
  narrowed (e.g. `T | null` → `T`); callers that null-check stay valid but
  callers that don't bypass null can break — visible only with callers in
  prompt.

Each case carries:

```ts
{
  owner_kind: 'agent',
  owner_id: '<agent-uuid>',
  input_diff: '<unified diff string>',
  expected_output: {
    must_find: [
      {
        file: '<caller file path>',        // matched against grounded findings
        // optional: line range, title substring; helpers.expectedFindings() tolerates
      },
    ],
    must_not_flag: [/* known-good signatures in the SAME diff */],
  },
}
```

**Discipline (eval-harness.md §9):** the cross-file held-out cases must NOT
overlap with the deterministic phantom recall fixtures in
`server/test/phantom-recall.test.ts`. Phantom-gate is deterministic; the LLM
must not get extra credit for catches that the detector layer already pins.

## 3. Wiring the BEFORE / AFTER switch

The eval-harness already runs through `reviewer-core.reviewPullRequest()`,
which means flipping `REPO_INTEL_ENABLED` at process start IS the switch.
The server reads `config.repoIntelEnabled` once in `Container` and threads it
through the facade; `getCallerSignatures` short-circuits to `[]` when off
(see `server/src/modules/repo-intel/service.ts` lines around the flag check).

**BEFORE** = `REPO_INTEL_ENABLED=false` (default). `run-executor.buildCallersDigest`
calls the facade, gets `[]`, returns `undefined`, `assemblePrompt` omits the
section → user message is byte-identical to pre-T1.3 (acceptance #10 — locked
by `server/test/prompt-callers.test.ts` "omits the section when callers is
undefined").

**AFTER** = `REPO_INTEL_ENABLED=true`. Same agent, same model, same gold-set;
the only delta is the `## Callers of changed symbols` block in the prompt.

## 4. Command sequence (run when prerequisites land)

```bash
# 0) cd into the server (NOT the workspace root)
cd apps/server

# 1) seed the gold-set into the running studio DB. Two options:
#    (a) idempotent script: write the cases as a one-off seed under
#        src/db/seed-eval.ts and run `pnpm tsx src/db/seed-eval.ts`. Cases
#        should carry source='gold' (see eval-harness §9) so they're skipped
#        by the harvester.
#    (b) interactive: POST /eval/cases for each case from the studio UI or
#        curl, attaching the JSON above.

# 2) make sure the agent owns the cases. Either reuse a seeded agent
#    (`acme/payments-api` demo agent) or create a fresh one via /agents.

# 3) BEFORE — runs with the flag off:
REPO_INTEL_ENABLED=false pnpm dev   # API on :3001
# in another shell, kick the eval:
curl -X POST http://localhost:3001/agents/<agent-id>/eval/run-all \
  -H 'content-type: application/json' \
  | tee before.json

# 4) AFTER — flip the flag and re-run on the SAME cases. The harness writes
#    a new `eval_run` per case; we read both and compare.
REPO_INTEL_ENABLED=true pnpm dev
curl -X POST http://localhost:3001/agents/<agent-id>/eval/run-all \
  -H 'content-type: application/json' \
  | tee after.json

# 5) Read the dashboard for the same agent — `EvalDashboard` already shows
#    recall/precision/citation per agent (see modules/eval/dashboard.ts).
curl http://localhost:3001/eval/dashboard?owner_kind=agent\&owner_id=<agent-id>
```

The aggregate response (`EvalRun` from `@devdigest/shared`):

```ts
{
  recall: number,                 // matched / must_find (eval-harness §7)
  precision: number,              // matched / actual
  citation_accuracy: number,      // grounded / raw — already locked by grounding
  traces_passed: number,          // recall===1 && precision===1
  traces_total: number,
  duration_ms: number,
  cost_usd: number,               // sum of completion costs
  per_trace: EvalPerTrace[],
}
```

Compare the BEFORE and AFTER `EvalRun.recall` and `.precision`. The Tier 1
gate (plan §4): if recall on the cross-file class doesn't move (within the
small-N noise band — eval-harness G8) when the prompt is enriched, the
hypothesis fails and we stop at T1 instead of paying for T2's indexer.

## 5. Cost guard (eval-harness §5: `DEVDIGEST_MAX_COST_USD`)

The harness already respects a per-run cost cap. Set it ≤ $1 for the gold-set
to keep the eval cheap during iteration:

```bash
DEVDIGEST_MAX_COST_USD=1 REPO_INTEL_ENABLED=true pnpm dev
```

## 6. What was BLOCKED here

In this run (2026-06-11):

- `docker info` → exits non-zero (no daemon) → Testcontainers `describe.skip`
  fires on every integration test that needs Postgres. Without Postgres there's
  nowhere to persist `eval_runs`.
- `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` are all empty →
  no reviewer model can complete the structured call inside `reviewCase`.

So Deliverable C is documented + wired, **not** measured. Deliverable A
(`server/test/phantom-recall.test.ts`) DID run here and measured:

```
[phantom-eval] fixtures=10 planted=5 caught=5 controls=21 fp=0
              recall=1.00 precision_on_controls=1.00
```

That is the hard evidence that the phantom-gate's claim holds. The cross-file
recall delta needs an LLM in the loop and is BLOCKED on the two prerequisites
listed in §1.
