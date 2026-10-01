# Intent Layer (PR → derived intent → reviewer + PR Brief card)

**Status:** in progress
**Packages touched:** server, reviewer-core, client, `@devdigest/shared`

Before the review agents run, a cheap classifier works out what a pull request is
*for* (intent, in/out of scope, risk areas) from the evidence around it, stores that
with its provenance, shows it on the PR Overview tab and hands it to the reviewer as
a claim to verify against the diff.

## Problem

A reviewer that sees only a diff (plus the author's free-text body) cannot tell a
deliberate change from an accident, and cannot tell which parts of a large diff the
author considers the point. Many PRs have no useful description at all; their purpose
lives in a linked issue, a plan/spec document in the repo, the commits or the branch
name. Nothing in the studio collects that, and the reviewer never sees it.

## Scope - in / out

**In**

- **Derive.** One structured call on the `review_intent` feature model (default
  `openrouter` / `deepseek/deepseek-v4-flash`, changeable in Settings -> Models).
  The classifier has no tools and sees a capped, delimiter-wrapped evidence pack.
- **Evidence.** PR description; up to 3 same-repo GitHub issues (closing keywords
  `close[sd]? / fix(e[sd])? / resolve[sd]?` first); up to 3 plan/spec docs (linked in
  the PR text, or added/changed by the PR under `specs/`, `docs/specs/`, `plan*.md`,
  `*.spec.md`); commit messages (<= 50); branch; changed paths (<= 300); a diff excerpt.
- **Documented vs fallback.** With real prose, an issue or a plan doc the intent comes
  from those. Otherwise the fallback derives only from commits/branch/paths, confidence
  is low and the model must say "unknown" instead of inventing a purpose.
- **Provenance.** Every source is recorded in `sources_used` with a status
  (`used`, `unreadable`, `skipped_external`, `unresolved`) and a `truncated` flag.
- **Grounded risk areas.** `IntentRiskArea {kind, title, file, line|null, explanation}`;
  an area whose file is not in the diff is dropped, a line outside the hunks becomes null.
- **Reviewer prompt.** A `## Stated intent (claim - verify against the diff)` section,
  wrapped as untrusted, capped at 3000 chars, after the task line and before
  `## PR description`. Low confidence adds an "intent is uncertain" line. No intent ->
  the prompt is byte-identical to before. The trace stores it in `prompt_assembly.intent`.
- **Cache.** Stored per PR in `pr_intent`; reused when `head_sha` and `input_hash`
  (evidence + model + prompt version) both match.
- **API.** `GET /pulls/:id/intent` (pure read, `stale` when the head moved) and
  `POST /pulls/:id/intent/regenerate` (rate limited, 30 s budget, 409 `intent_unavailable`).
- **UI.** A "PR Brief" section on the Overview tab: two-column grid, `IntentCard` on the
  left (quote, scope lists, expandable risk areas, confidence badge, source chips, stale
  notice + Regenerate, model and cost footer, loading/empty/error states).

**Out**

- **Blast Radius.** The right grid slot stays empty on purpose.
- **Resolving Jira/Linear keys or cross-repo `owner/repo#N`.** They are recorded as
  `unresolved`, never fetched. No arbitrary URL is ever fetched; off-repo links are
  `skipped_external`.
- Putting intent cost into `agent_runs.cost_usd` or the PR-list cost. It lives only in
  `pr_intent.cost_usd` and the card footer.
- Reusing the `Risk` contract (different shape: it has severity and `file_refs`).
- Failing a review run because intent failed. Intent is best-effort.

## Decisions taken

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | The model classifies; **code grounds** the result (`finalizeIntent`) | confidence is clamped and capped, invented files are dropped |
| D2 | Confidence caps: 0.4 when undocumented, 0.7 when a plan the PR links is unreadable | thin evidence can never read as "high" |
| D3 | Levels: `< 0.45` low, `< 0.75` medium, else high | the UI badge and the prompt note derive from one rule |
| D4 | Everything from the PR (body, issues, plans, commits, paths) is untrusted data in `wrapUntrusted` blocks; the system prompt is fixed | a PR cannot instruct the classifier |
| D5 | Intent never throws into the run: `ensureIntent` returns `undefined` and logs a warning without PR text | reviews still complete when the cheap model is down |
| D6 | `readFileAt` uses `git show ref:path` as an argument array, rejects `..`, absolute, `.git/` paths and caps size | plan links cannot read outside the repo |

## Contract changes

`@devdigest/shared` first, client vendor copy hand-synced:
`brief.ts` (`IntentSourceKind`, `IntentSourceRef`, `IntentConfidence`, `IntentRiskKind`,
`IntentRiskArea`, `IntentClassification`, `PrIntent`), `review-api.ts`
(`PrIntentRecord`, `PrIntentResponse`), `trace.ts` (`PromptAssembly.intent`),
`adapters.ts` (`GitClient.readFileAt`), `platform.ts` (`review_intent` default + description).
DB: `pr_intent` gains 13 columns (migration `0013_*`, `ADD COLUMN IF NOT EXISTS`).

## Acceptance criteria

1. Opening a PR that has no intent shows the empty state; Generate produces a card.
2. A PR whose body links `Fixes #N` (same repo) records `#N` as a `used` source and its
   text reaches the classifier; a Jira key is listed as `unresolved` and never fetched.
3. A PR with an empty body and no plan doc is derived in fallback mode: low confidence,
   warning badge and hint.
4. A plan doc added by the PR is read at the head commit and shown as a source chip.
5. Risk areas only name changed files; expanding a row shows its explanation.
6. After a new commit the card shows the stale notice; Regenerate clears it.
7. A run with the intent model failing still finishes; the trace has `prompt.intent` null.
8. A run with intent stores the block in `prompt_assembly.intent`; without it the prompt
   is unchanged.
9. Settings -> Models lists "PR Review - Intent" with the new default.
10. `agent_runs.cost_usd` and the PR-list cost are unchanged by intent derivation.

## Open questions

- Should a low-confidence intent be withheld from the reviewer prompt entirely, rather
  than included with the uncertainty note?
- Should the trace drawer show the intent block as its own slot?
- The wall-clock timeout races the derivation; it does not cancel the in-flight LLM call.
