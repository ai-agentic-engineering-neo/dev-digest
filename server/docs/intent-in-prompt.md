# Intent in the prompt

How a PR's title, linked docs and issues become the `## PR intent (derived)`
section every reviewer agent sees, and the decisions that shape it.

## The path

```
PR title + body (+ linked spec/plan docs at head_sha, + up to 3 same-repo issues)
  → parseReferences (fixed regexes, capped input)
  → collectSources (reads docs/issues, degrades on failure, never throws)
  → computeConfidence (deterministic, code-only — never the model's own claim)
  → intent.system.md + renderDerivationPrompt → ONE structured model call (review_intent)
  → normalizeDerivation → pr_intent row (cached by source_hash)
  → renderIntentBlock → ReviewInput.intent → assemblePrompt's `## PR intent (derived)` section
```

`server/src/modules/intent/` owns every step from `parseReferences` through the
`pr_intent` row; `reviewer-core` only formats the last, pre-rendered string —
see `reviewer-core/README.md` § Public API.

## The cache key

`source_hash` is a sha256 of a canonical JSON document: the derivation
version, the system template's own hash, provider + model, title and body
(as used), each doc as `{path, sha256(content)}`, each issue as
`{number, sha256(title\nbody)}`, branch, commit subjects, files with their
+/− counts, sorted labels, and the unresolved references. It deliberately
**excludes the raw `head_sha`** — a commit that only touches unrelated files
must still hit the cache. `head_sha` is tracked separately and drives the
`GET`-endpoint `stale` flag together with a `text_hash` of title+body.

## Why intent is untrusted, unlike skills

A linked skill is rendered as trusted instruction text (`skills-in-prompt.md`)
because enabling one is a deliberate act by whoever configured the agent. An
intent block is different: it is *derived from PR-author-controlled text* by a
cheap model, with no human review in the loop before a reviewer agent sees it.
So `assemblePrompt` wraps it in `<untrusted source="intent">…</untrusted>`,
exactly like the diff and the PR description, and prepends a trusted rule
(`INTENT_RULE` in `reviewer-core/src/prompt.ts`) that forbids using it to lower
a finding's severity or drop one. The confidence level itself is computed in
code from which sources resolved — never asked of, or trusted from, the model.

## Why derivation is lazy

Intent is derived only at review pre-work or on the Derive button — never at
import, list sync, or opening the PR page. List sync runs every 60s over up to
50 PRs and doesn't even persist the body, so an eager derivation there would
be both wasteful (paying for PRs nobody reviews) and wrong (always `low`
confidence, since sync never has the current text). The review is the one
place intent is actually consumed, so deriving there keeps it fresh at the PR's
current `head_sha`.

## The cross-repo issue policy

`owner/repo#N` references to a DIFFERENT repository are parsed (so they show
up as `unresolved` on the card) but never fetched — `FETCH_CROSS_REPO_ISSUES`
in `constants.ts` is `false`, and it is one constant, not a per-workspace
setting. With the user's own GitHub token, a PR author could otherwise
reference a private issue in another repository the user can see but the PR's
audience cannot, and its text would be sent to the LLM provider. Ticket keys
(`PROJ-123`) and external links are recorded the same way — visible as
"unresolved", never fetched — because there is no tracker integration.
