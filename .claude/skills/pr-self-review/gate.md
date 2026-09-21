# Severity Mapping & Gate

## What counts as CRITICAL

Each skill has its own vocabulary for severity; this table is the single normalization
point so the gate rule below has one consistent meaning. Anything not listed here defaults
to HIGH or MEDIUM (reported, never blocking).

| Source | CRITICAL means |
|---|---|
| `security` | Finding reported at HIGH confidence (per `security/SKILL.md`'s own CRITICAL/HIGH criteria — direct exploit, no auth required, hardcoded secret, missing auth, injection, RCE). |
| `react-best-practices` | Finding the skill itself classifies as CRITICAL. |
| `onion-architecture` | A dependency-direction violation — inner layer importing an outer one, a service/route reaching for `drizzle-orm`/`octokit`/`openai`/`@anthropic-ai/sdk` directly instead of through a port. Not the optional `dependency-cruiser` sketch in `enforcement.md` — that isn't wired into CI, so it isn't a mechanical gate today. |
| `zod` / contract changes | A change to `server/src/vendor/shared/**` that breaks a shape another package (`client`, `reviewer-core`) already imports, without updating the consumer. |
| `code-review` | Any finding it reports at its own highest confidence/correctness tier for a real bug (not style). |
| everything else | Never auto-CRITICAL — surfaced as HIGH/MEDIUM. |

## Gate rule

```
critical_count >= 1  → verdict = BLOCKED
critical_count == 0  → verdict = PASS
```

HIGH/MEDIUM findings are always included in the report but never change the verdict.

## Status file

Written by [SKILL.md](SKILL.md) Step 4, read by `scripts/check-gate.sh`. Location:
`$(git rev-parse --git-dir)/pr-self-review-status` — inside `.git/`, so it's per-checkout
and never committed. Plain `key=value` lines (no JSON — avoids a hard `jq` dependency in
Git Bash on Windows):

```
diff_hash=<sha256 from scripts/diff-hash.sh, or "EMPTY">
verdict=PASS|BLOCKED
critical_count=<int>
high_count=<int>
medium_count=<int>
timestamp=<UTC ISO8601>
ack=true|false
ack_hash=<sha256 that was acknowledged, blank if none>
ack_reason=<quoted string>
ack_timestamp=<UTC ISO8601, blank if none>
```

`diff_hash` is the cache key: any change to the scoped diff (new commit, amend, more
uncommitted edits) changes the hash, which invalidates the cached verdict and forces a
re-run — `check-gate.sh` treats a hash mismatch the same as "never ran".

## Override / acknowledge protocol

Blocking is deliberate-but-not-silent, not absolute: the hook (see
[README.md](README.md#hook-wiring)) will keep refusing `gh pr create`/`gh pr merge` for a
BLOCKED verdict until an explicit acknowledgement is recorded — and that acknowledgement
must come from a real user confirmation in chat, never from the agent deciding on its own
that a finding doesn't matter.

1. Agent shows the CRITICAL findings to the user and states plainly that opening/merging
   is blocked.
2. User explicitly confirms they want to proceed anyway (e.g. "ignore it, open the PR").
3. Only then, agent runs:
   ```bash
   bash .claude/skills/pr-self-review/scripts/check-gate.sh --acknowledge "<reason/quote>"
   ```
   This only succeeds if the status file's `diff_hash` still matches the current diff — if
   the user has made further changes since the review ran, it fails and demands a re-run
   instead of silently carrying forward a stale acknowledgement.

### Override audit trail

When opening the PR after an acknowledged override, include this block in the PR body so a
human reviewer on GitHub sees what was overridden and why — don't let the override
disappear once the local gate is satisfied:

```markdown
> ⚠️ **Self-review override**: N critical finding(s) were flagged by `pr-self-review` and
> explicitly overridden by the author.
> - <critical finding 1 summary — file:line>
> - <critical finding 2 summary — file:line>
> Reason: <the reason passed to --acknowledge>
```

## Report format

```
## PR Self Review — <branch> → <base>
Files changed: N (client: X, server: Y, reviewer-core: Z, ...)
Skills run: security, code-review, <domain skills that had non-empty buckets>

### CRITICAL (blocking)
- [security] client/src/components/Form.tsx:42 — ...

### HIGH / MEDIUM
- [react-best-practices] client/src/hooks/useThing.ts:10 — ...

Verdict: PASS | BLOCKED — N critical
```
