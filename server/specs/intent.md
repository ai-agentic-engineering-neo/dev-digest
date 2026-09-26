# spec — intent

The Intent Layer derives what a pull request is meant to do, and what it
deliberately leaves out, before any reviewer agent runs. One structured call to
a cheap flash model reads the PR title and description, the issues it closes,
the plan and spec docs it links, and an outline of the changed files. The result
is stored per PR at its head SHA, shown on the PR Overview tab, and rendered
into every reviewer prompt as a `## PR intent` section. This is the canonical
spec: the invariants below are behaviour the review path and the Overview card
already depend on, so changing one is a breaking change, not a refactor.

Review cycle it plugs into: [`review-flow.md`](review-flow.md).
The engine's prompt slot: [`../../reviewer-core/specs/review-contract.md`](../../reviewer-core/specs/review-contract.md).
Design history: [`../../docs/plans/2026-09-25-intent-layer.md`](../../docs/plans/2026-09-25-intent-layer.md).
Code: `src/modules/intent/` (routes → service → repository, pure rules in
`helpers.ts`, caps in `constants.ts`), `src/adapters/http/web-fetch.ts`.

## Invariants

| # | Rule |
|---|---|
| I1 | References are parsed from the PR body only (first 20 000 chars), deduped and capped per kind. **Issues:** only behind a closing keyword (`close[sd]`, `fix(es\|ed)`, `resolve[sd]`) as `#N`, `owner/repo#N` or a GitHub issue URL; a bare `#123` is not a reference. Max 3. **Repo docs:** relative `*.md` paths, and `github.com/<same repo>/blob/…` links, read at the PR's `head_sha`; absolute paths, `..`, `.git`, `\`, `:` and NUL are rejected. Max 5. **URLs:** `https` only, no userinfo; a `github.com` blob link to another repo becomes its `raw.githubusercontent.com` URL, any other `github.com` page is skipped. Max 3. |
| I2 | Every source is fetched in parallel with a 5 s timeout and a 256 KB / 12 000-char cap. A failed or empty source never throws: it becomes an `unavailable` ledger entry with 0 chars. The only derivation-level failures are a missing PR/repo (404) and the classifier call itself (502). |
| I3 | Untrusted text never sits outside the delimiters. Section headings are a fixed server-built vocabulary (`PR description`, `Issue 1`, `Repo doc 2`, `Web page 1`, `Changed files outline`). The concrete reference (`owner/repo#N`, a path, a redacted URL) is the first `Reference: <ref>` line **inside** the `wrapUntrusted` block. |
| I4 | The classifier input is budgeted to about 8 000 tokens. Over budget, hunk headers of the outline are dropped first (trailing files lose theirs first), then the longest fetched doc is trimmed by 25 % at a time, never below 500 chars. The PR description is capped at 4 000 chars up front. Every shortened section is recorded as `truncated`. |
| I5 | `confidence` is computed by the server, never reported by the model: `high` when at least one linked source (issue, repo doc, web page) was read (`ok` or `truncated`); else `medium` when the PR has a description; else `low`. |
| I6 | The model's answer is capped before it is stored: `intent` ≤ 600 chars; `in_scope`, `out_of_scope` and `missing_context` ≤ 8 items of ≤ 200 chars each, whitespace-collapsed and deduped case-insensitively. `missing_context` lists one `Could not read <kind>: <ref>` line per unavailable source first, then the model's own gaps. |
| I7 | References are redacted before they are stored or logged: a URL keeps `origin + pathname` only (no userinfo, query or fragment). Logs carry counts, sizes, statuses and short reason codes — never source text, the intent itself, or a raw URL. |
| I8 | One row per PR, keyed on `head_sha`. `getOrDerive` (the review path) reuses the stored row while its `head_sha` equals the PR's current head and derives a new one otherwise. `recompute` always derives. A write is an upsert. |
| I9 | Derivation inside `executeRuns` is **best-effort and never fails a run** (the `review-flow.md` enrichment rule). A failure is caught inside the `Deriving intent` step, reported as an info line in the Live Log plus a server `warn`, and never as an SSE `error` event (the client toasts those). Every agent then reviews with no intent section. |
| I10 | The reviewer prompt gets `## PR intent` only when the intent has text or a non-empty scope list. It holds a trusted scope rule followed by the wrapped intent, scope lists and confidence. The rule: stay on changes that serve the intent and skip out-of-scope concerns, **except** that a CRITICAL problem or any security vulnerability in out-of-scope changed code is still reported, once, at its true severity. Intent never lowers a severity and never bypasses grounding. With no intent the prompt is byte-identical to before. |
| I11 | Everything is scoped by `workspace_id`. A PR outside the workspace returns 404; `pr_files` has no workspace column, so the PR is proven to belong to the workspace before its patches are read. |

## Outline

The outline tells the model where the change lands, not what the code does. It
is built from the diff the executor already loaded or, on `recompute`, from a
fresh `git diff base..head`; with no clone or an unknown ref it falls back to
the persisted `pr_files` patches. Each file contributes its path and its hunk
headers (`@@ … @@ <context>`), each clipped to 200 chars.

## Web fetch (SSRF policy)

External URLs go through the `WebFetchClient` port. `HttpWebFetchClient` is the
only implementation and is resolved from the container; a module never imports it.

- `https` only, no userinfo, default port only.
- The host is resolved and **every** address must be public unicast
  (`ip-policy.ts`, fail-closed): private, loopback, link-local (including the
  `169.254.169.254` metadata address), CGNAT, ULA, multicast and reserved ranges
  are rejected; an IPv4-mapped IPv6 address is judged as the IPv4 it carries.
- The connection is pinned to the validated addresses, so DNS rebinding between
  the check and the connect cannot redirect it.
- Redirects are followed manually, at most 3, and each hop is validated again.
- Only `text/plain` and `text/markdown` responses are read; HTML is
  `unavailable` in v1. The body is byte-capped and cut on a UTF-8 boundary.
- Errors are `WebFetchError` with a short code (`blocked_host`, `dns_failed`,
  `unsupported_type`, `timeout`, …) and never carry the URL or the body.

## Data model

Migration is drizzle-kit generated (`pnpm db:generate`), never hand-edited.

- **`pr_intent`** (existing table, extended by `0015`): `pr_id` (PK, fk →
  `pull_requests.id`, cascade), `workspace_id` (fk → `workspaces.id`, cascade),
  `intent`, `in_scope jsonb`, `out_of_scope jsonb`, `confidence text default 'low'`,
  `sources jsonb` (the ledger), `missing_context jsonb`, `head_sha` (the staleness
  key), `provider`, `model`, `tokens_in`, `tokens_out`, `updated_at`.
  `workspace_id` was added `NOT NULL` without a default; that was safe only
  because nothing had ever written the table.
- **Contracts** (both `vendor/shared` copies — see root `INSIGHTS.md` on drift):
  `PrIntentRecord` = `Intent` + `{pr_id, confidence, sources, missing_context,
  head_sha, provider, model, tokens_in, tokens_out, updated_at}`, with
  `IntentSource = {kind: description|issue|repo_doc|web|diff_outline, ref, status: ok|unavailable|truncated, chars}`.
- The classifier's own output schema (`PrIntentClassification` in
  `intent/prompt.ts`) is module-local and never sent to the client. It has no
  confidence field, by I5.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/pulls/:id/intent` | The stored `PrIntentRecord`, or the JSON literal `null` when none was derived yet. 404 when the PR is not in the workspace. |
| POST | `/pulls/:id/intent/recompute` | Derives now, bypassing the `head_sha` cache (I8), and returns the record. Rate-limited to 10 per minute: each call is a paid LLM request plus outbound fetches. 502 when the classifier call fails. |

The client shows the record in the Overview tab's `IntentCard` and flags it as
stale when its `head_sha` differs from the PR's current head, or is `null`.

## Model and observability

- Feature model `review_intent`, resolved per workspace with
  `resolveFeatureModel`. Default: `openrouter` / `deepseek/deepseek-v4-flash`.
  Temperature 0, 2 retries, 60 s timeout.
- The classifier prompt emits one content-free `prompt.assembled` record per
  call (`component: intent_classifier`), under the `PROMPT_LOG` rules in
  `review-flow.md`. On the review path it carries `round_id` and `run_ids`, on
  `recompute` the `request_id`. It is logged before the call, so a failed
  classification is still on record, and logging never fails the derivation.
- A successful derivation logs `Intent derived` with provider, model, file and
  hunk-header counts, tokens, the redacted ledger with reason codes, and the
  confidence.

## Testing

A new step in `executeRuns` reaches real clients in `reviews.it.test.ts` unless
`appWith` overrides them (see `server/INSIGHTS.md`, 2026-09-26). Intent needs
`github`, `webFetch` and the classifier's `llm.<provider>` mocked, or
`intent` itself. The cache and the routes are tested directly in
`intent.it.test.ts`; pure rules in `intent-helpers.test.ts`; the SSRF policy in
`web-fetch.test.ts`.

## Out of scope (v1)

- Authenticated or private trackers (Jira, Linear, private URLs): recorded as `unavailable`.
- HTML pages: `unavailable`; an html-to-text step is a later option.
- Any change to the `Finding` contract: the scope rule is prompt-only.
- E2E coverage and seed data for the card: both need an LLM-free seeded `pr_intent` row.
