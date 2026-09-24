# 05 — Intent layer (server)

UI half: [`client/specs/05-intent-layer.md`](../../client/specs/05-intent-layer.md).
Course slot: **L03 — Intent layer** (README "What you build"; the other half of
L03, Smart Diff, is not in this slice).
Status: **in progress** (2026-09-24).

## Goal

Before a review runs, work out *why* the PR exists: its intent, what's in scope,
what's out of scope, the change type and a confidence level. Add it to every
agent's prompt as untrusted data, and flag findings the model marks as outside
the stated intent — without ever dropping or downgrading them.

## Out of scope

- Jira/Linear/other ticket systems. Keys like `ABC-123` are only listed as
  `skipped` sources.
- Following links found inside tickets or docs (one hop only), docs from other
  repos, and non-GitHub URLs (no arbitrary URL fetch).
- Excluding out-of-scope findings from the score, or hiding them by default.
- Smart Diff (the other half of L03), PR Brief card (L05), Plan Verifier (L06).
- Changing `INJECTION_GUARD`, `wrapUntrusted` or grounding semantics.

## Data sources

| Source | Where from / when | Trust | Limit (prompt) |
|---|---|---|---|
| Title | `pull_requests.title` | untrusted | 300 chars |
| Body | `pull_requests.body` (set by `GET /pulls/:id`) | untrusted | 6,000 chars, HTML comments stripped |
| Tickets | `#N`, `fixes #N`, `owner/repo#N` (same repo), `github.com/o/r/issues/N` in title, body, commits; `getIssue` on miss; self-refs/foreign skipped | untrusted | max 3; closing keywords first; 3,000 chars each |
| Docs (plan/spec) | Markdown links + bare paths in title/body; same-repo `github.com/o/r/(blob\|tree)/<ref>/<path>` read at head. Priority `docs/plans/**`, `**/specs/**`, `docs/**`, other `.md` | untrusted | max 5; 64 KiB fetched; 8,000 chars each; 20,000 total |
| Commits | `pr_commits` | untrusted | 30 × 200 chars |
| Branch | `pull_requests.branch` | untrusted | 120 chars |
| Changed files + stats | executor diff; refresh uses `pr_files` | derived | 100 paths |
| Diff excerpt | same, only when `inferred` | untrusted | 6,000 chars |

Each source becomes one `Intent.sources[]` entry: `{kind, ref, status:
used|truncated|skipped|failed, detail}`, built by the server (never echoed from
the model).

## Pipeline (`modules/intent`, onion layout like `modules/conventions`)

1. **Resolve inputs (code, no model).** Parse ticket refs and doc links/paths
   out of title + body + commit messages. Same-repo GitHub issues only;
   Jira/Linear-shaped keys (`ABC-123`) are recorded `skipped`. Doc paths are
   read at the PR's **head sha** (`GitClient.readFileAt`, falling back to
   `GitHubClient.getFileContent`), never the working tree.
2. **Confidence set by code, before the call.** `derived_from='explicit'` when
   the body is substantive (≥40 chars after stripping HTML comments/template
   headings) or at least one ticket/doc loaded; otherwise `'inferred'` and the
   prompt falls back to commits, branch name, changed paths and (only then) a
   diff excerpt — confidence is forced `low`. An explicit derivation is capped
   at `medium` when a referenced doc/ticket failed or was skipped.
3. **Classify (one structured call).** The model comes from Settings → Feature
   models → `review_intent` (default `openrouter` / `deepseek/deepseek-v4-flash`).
   It returns `{intent, in_scope, out_of_scope, change_type}` — never the
   confidence or the sources list, which are code-owned. Every source is
   `wrapUntrusted` per item.
4. **Persist.** One row per PR (`pr_intent`), keyed by
   `input_hash = sha256(canonicalJSON{prompt_version, provider, model, title,
   body, branch, head_sha, ticket_refs[], doc_paths[]})`, computed before any
   I/O. A cache hit skips the call entirely. Ticket bodies are not part of the
   key (a ticket edited after derivation needs a manual refresh — the response
   then reports `stale: true`). No stale fallback on failure. Single-flight per
   `prId:hash` (concurrent requests for the same input share one in-flight call).

A failure (no API key, provider error, timeout, budget exceeded) never fails
the review: the executor logs `info` `warning: intent unavailable — …`
(`data.warning='intent_unavailable'`) and the review runs without intent.
Budget: 30 s, `AbortController`-bound; only aborts when every queued run of the
shared pre-work is cancelled.

## Call sequence

1. `POST /pulls/:id/review` → `startReview` → `executeRuns` (fire-and-forget).
2. Executor shared pre-work: `Loading PR diff` → `resolveIntentPrework` →
   `IntentService.resolveForReview`: resolve feature model → parse links →
   compute key → read `pr_intent` → hit: log `PR intent ready (cached,
   confidence=…)`; miss: fetch tickets/docs, build the prompt, classify
   (temp 0, maxRetries 1, 800 out tokens max), clamp arrays, cap confidence,
   upsert with usage, log sources/usage/cost. Any throw → warning, intent
   undefined — the rest of the run is unaffected.
3. Per agent: `reviewPullRequest({..., intent})` renders `## PR intent` →
   grounding (unchanged) → `applyScopePolicy` (reviewer-core, deterministic) →
   score (unchanged formula).
4. Persist `findings.out_of_scope`; the run's trace carries
   `prompt_assembly.intent` (the rendered untrusted content) and
   `trace.intent` (status/confidence/model/cost/sources).
5. The client refetches run-scoped queries (incl. intent) when the SSE stream
   ends; the refresh endpoint re-derives on demand (rate limited 10/min).

## Out-of-scope finding policy (deterministic, `reviewer-core.applyScopePolicy`)

- No intent present (derivation unavailable/disabled) → `out_of_scope` stays
  `null` on every finding; behavior is unchanged from before this feature.
- Intent present → each finding's file/rationale is compared to
  `in_scope`/`out_of_scope`; a finding judged outside the stated intent gets
  `out_of_scope: true`.
- The flag **never** drops a finding and **never** lowers its severity: a
  CRITICAL out-of-scope finding still counts as a blocker and still counts
  toward the score. Only its badge changes.
- Low-confidence intent still goes into the prompt (labelled `confidence: low
  (inferred)`) with a stricter instruction: prefer flagging over guessing scope
  when unsure.

## API

| Method | Path | Result |
|---|---|---|
| GET | `/pulls/:id/intent` | `PrIntentResponse` = `{intent: PrIntentRecord \| null, stale: boolean}` |
| POST | `/pulls/:id/intent/refresh` | Forces re-derivation (ignores the cache); rate limited 10/min |

Every route reads the workspace from `getContext`. A PR from another workspace
is a 404.

## Cost attribution

The intent call's usage (tokens, cost) is stored on `pr_intent` and in each
run's `trace.intent` — **never** added to `agent_runs.cost_usd` /
`reviews.cost_usd`. One derivation is shared by every agent run of the same
`POST /pulls/:id/review` request (and by cache hits across later reviews of
the same PR/head/model), so it is billed once, separately from the reviews it
feeds.

## Kill switch

`REVIEW_INTENT_ENABLED` (`platform/config.ts`, default **on**). When off, the
executor's shared pre-work skips intent derivation entirely (no call, no
`pr_intent` row) and every agent's prompt is byte-identical to before this
feature. Existing review integration tests set it `false` so they never make a
real paid call.

## Migration

- `pr_intent` (existing table) adds: `change_type`, `confidence`,
  `derived_from` (text NOT NULL + CHECK), `sources jsonb`, `head_sha`,
  `input_hash`, `prompt_version`, `provider`, `model`, `tokens_in`,
  `tokens_out`, `cost_usd numeric(12,6)`, `derived_at timestamptz`. Add-only —
  every new column nullable or defaulted so existing (empty) rows stay valid.
- `findings` adds `out_of_scope boolean NOT NULL DEFAULT false`.

## Acceptance criteria

1. `POST /pulls/:id/review` on a PR with a substantive body derives an intent
   (`derived_from='explicit'`) once and every queued agent's run trace shows
   `prompt_assembly.intent` and `trace.intent`.
2. A second review of the same PR/head/model reuses the cached row (no second
   LLM call); `trace.intent` reports the cache hit.
3. A PR with an empty body and no linked ticket/doc still gets an intent
   (`derived_from='inferred'`, `confidence='low'`), built from commits/branch/
   changed paths (+ diff excerpt).
4. A CRITICAL finding the model judges out of scope is still persisted, still
   a blocker, still counted in the score — only `out_of_scope=true` differs.
5. `REVIEW_INTENT_ENABLED=false` → no `pr_intent` row is written and the
   prompt is byte-identical to a review with no intent support at all.
6. A missing/expired provider key does not fail the review: the run's log has
   an `info` line `warning: intent unavailable — …` and findings persist as
   before.
7. `GET /pulls/:id/intent` before any review → `{intent: null, stale: false}`.
   `POST /pulls/:id/intent/refresh` re-derives even when a fresh cache hit
   would otherwise apply.
8. A ticket key from another repo, or a Jira-shaped key (`ABC-123`), never
   triggers a GitHub call and shows up as a `skipped` source.
9. A doc path outside the same repo, or a non-`.md`/`.mdx`/`.markdown`/`.txt`
   path, is never read.

## Open questions — resolved for this slice

1. Default intent model: **openrouter / deepseek/deepseek-v4-flash**.
2. Who pays for the intent call: **`pr_intent` + `trace` only**, never
   `agent_runs.cost_usd`.
3. Non-critical out-of-scope findings: **kept, flagged, score unchanged**.
4. Low-confidence intent in reviewer prompts: **yes, labelled, with the
   stricter rule** (not UI-only).
5. Tickets: **same-repo GitHub issues only** (no Jira/Linear this slice).
