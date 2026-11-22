# Entry template

Every entry in `insights.md` follows this shape. Copy it, fill in, append to the end of the correct rubric section.

```markdown
### <short-title-in-imperative-or-noun-form>
**Date:** YYYY-MM-DD
**Evidence:** `relative/path/to/file.ts:LINE`

<1–3 sentences. Actionable "cold": a reader with no session context can tell what to do or avoid.>
```

## Example — filled

```markdown
### Batch PR review with p-limit, not Promise.all
**Date:** 2026-11-22
**Evidence:** `server/src/modules/reviews/run-executor.ts:142`

`Promise.all` over per-file reviews OOMs the server on 500+ file PRs (heap hits ~4 GB and the process is killed). Use `p-limit` with concurrency 10; this keeps peak memory under 800 MB and only adds ~15% wall-clock time.
```

## Multi-point entries

If a single finding has 2–3 related points, use nested bullets under the body — don't split into separate entries unless they belong in different sections.

```markdown
### <title>
**Date:** YYYY-MM-DD
**Evidence:** `path:line`

- Point 1.
- Point 2.
- Point 3.
```

## Correcting a stale entry

Don't edit the original. Append a dated "Superseded" note right below it:

```markdown
### <original title>
...

> **Superseded 2026-12-15:** Behavior changed after upgrading drizzle-orm to 0.31; `.returning()` now includes generated columns, so the re-SELECT workaround is no longer needed. Delete calls to `reloadAfterInsert()` when touching this area.
```

## Rules

- **Date:** ISO (YYYY-MM-DD), the day you capture, not the day the bug happened.
- **Evidence:** at least one `file:line` reference whenever possible. If the finding is cross-file, pick the most representative anchor.
- **Body:** terse, declarative, no filler. If you can delete a sentence without losing the lesson, delete it.
- **No session narration:** don't write "we were working on X when we noticed…" — just the finding.
- **Third person / imperative:** write as a note to a future reader, not as a journal entry.
