---
name: engineering-insights
description: Records non-obvious, practical findings from a coding session (hidden dependencies, fixes, measured facts, surprising behaviour) into the INSIGHTS.md of the module that was worked on (client/, server/, reviewer-core/, e2e/), with file:line evidence and a date. Use at the end of every coding task in this repository, after a bug fix, or whenever something in the codebase turned out to work differently than expected.
---

# engineering-insights

Capture what this session learned so the next session does not have to
rediscover it. One module = one file: `client/INSIGHTS.md`,
`server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`.

## When to run

- **Wrap-up:** at the end of every coding task, before the final commit/PR.
- **Capture as you go:** right after you confirm something non-obvious
  (a fix worked, a measurement came in, an assumption turned out wrong).
- Skip trivial sessions (typo fixes, pure formatting) — write nothing rather
  than filler.

## Procedure

1. List the modules you changed or investigated (`git diff --name-only` and
   the files you read). Each top-level package folder is a module.
2. For each module, collect candidate findings from this session. Keep only
   those that pass the **cold-reader test**: *would a competent engineer reading
   the code for the first time miss this or get it wrong?* If it is obvious from
   the code or already in `CLAUDE.md`/README, drop it.
3. Read the module's `INSIGHTS.md` (create it from the template below if it is
   missing). Skip findings that are already recorded; if a new finding
   contradicts an old one, do not delete the old entry — append a new entry
   that says `Supersedes <date> entry: …`.
4. Append each finding to the matching section, newest at the bottom, in the
   entry format below. Append-only: never rewrite or reorder existing entries.
5. Verify every `file:line` you cite actually points to the evidence (open the
   file). Use paths relative to the repository root.
6. Mention in your final message which INSIGHTS.md files you updated.

## Entry format

```
- **YYYY-MM-DD** · <one-sentence finding, actionable, specific> — evidence: `path/to/file.ts:123`
  <optional 1–2 lines: why it matters / what to do instead>
```

Categories (sections of the file):

- **Non-obvious dependencies** — couplings you cannot see from one file
  (aliases, duplicated contracts, implicit ordering, env flags).
- **Fixes & gotchas** — something broke or misled you and this is how to avoid it.
- **Measured facts** — numbers you actually observed (timings, token counts,
  sizes, limits), with how they were measured.
- **Surprises** — behaviour that differs from what names/comments suggest.

## Good vs bad entries

Bad (vague): "Be careful with shared contracts."
Good: "**2026-11-28** · `@devdigest/shared` exists as two vendored copies that
have drifted; a contract change must be applied to both or the client silently
keeps the old shape — evidence: `client/tsconfig.json:24`,
`server/tsconfig.json:22`."

Bad: "Run cost is computed somewhere."
Good: "**2026-11-28** · reviewer-core returns `costUsd` from
`reviewPullRequest` but the executor drops it, so cost is not persisted —
evidence: `server/src/modules/reviews/run-executor.ts:213`."

## Template for a new INSIGHTS.md

```markdown
# <module> — engineering insights

Append-only log of non-obvious findings, written by agents via the
`engineering-insights` skill. Newest entries at the bottom of each section.
Review and prune periodically; stale entries are harmful.

## Non-obvious dependencies

## Fixes & gotchas

## Measured facts

## Surprises
```

## Rules

- English only.
- Evidence is mandatory: an entry without `file:line` (or a command + output
  for measured facts) is not allowed.
- No secrets, tokens, or personal data in entries.
- Keep each file under ~200 entries; if it grows past that, propose splitting
  by domain instead of adding more.
