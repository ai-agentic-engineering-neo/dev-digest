# Finding schema & severity rubric

Every reviewer agent writes **one JSON file** (path given in its prompt) with this shape:

```json
{
  "bucket": "onion-architecture",
  "skill": "onion-architecture",
  "summary": "Checked 4 files: routes → service → repository split, imports of adapters.",
  "findings": [
    {
      "file": "server/src/modules/pulls/routes.ts",
      "line": 42,
      "quote": "const rows = await db.select().from(pulls)",
      "severity": "CRITICAL",
      "title": "Route handler queries Drizzle directly",
      "why": "Routes are the outer ring; querying db here bypasses PullsService/PullsRepository, so the business rule in service.ts is skipped for this endpoint and returns unfiltered rows.",
      "fix": "Call pullsService.list(...) and move the query into PullsRepository."
    }
  ]
}
```

| field | rule |
|---|---|
| `file` | repo-relative path, must be one of the files in your bucket |
| `line` | 1-based line in the **current** file (working tree), on the new side of the diff |
| `quote` | the code on that line, copied **verbatim** (one line is enough; ≥ 8 characters). A finding whose quote is not in the file is dropped as ungrounded |
| `severity` | exactly `CRITICAL`, `WARNING` or `SUGGESTION` |
| `title` | ≤ 90 chars, the defect — not the rule name |
| `why` | the concrete mechanism and consequence |
| `fix` | the smallest change that resolves it |

No findings → `"findings": []`. That is a valid and good answer.

## Severity — use exactly these three levels
*(verbatim from `docs/agent-prompts/general-reviewer.md`, the rubric the product's own reviewers use)*

- **CRITICAL** — a defect that, once merged, can cause a security breach, data
  loss/corruption, incorrect results, a crash, or a broken contract that callers
  depend on. This is the ONLY level that blocks merge.
- **WARNING** — a real problem worth fixing that does not block: a missed edge
  case, degraded behaviour, or a maintainability/perf risk that bites at scale.
- **SUGGESTION** — a minor improvement or nit; the PR is safe to merge without it.

Assign the severity you would defend to the author's face. Do NOT inflate: a
speculative issue ("might be", "could potentially", "if X isn't already handled
elsewhere") is at most a WARNING, never CRITICAL. If you would dismiss your own
finding as a likely false positive, do not report it at all.

### Mapping a skill's own labels
Skills have their own vocabulary (react-best-practices tags whole rule *categories*
"CRITICAL"; security has its own severity table; onion/frontend-ui list "rules").
**Those labels do not carry over.** Judge each individual finding against the
definitions above. Typical outcomes:

- Architecture rule broken (wrong ring, import pointing outward, logic in a route,
  component in the wrong folder) → **WARNING**, unless it causes one of the CRITICAL
  outcomes *right now* (e.g. a route bypasses the authz/validation the service applies).
- Rule-of-thumb / style / naming / "could be cleaner" → **SUGGESTION** or nothing.
- Security: confirmed attacker-controlled input reaching a dangerous sink → CRITICAL;
  input source unclear → WARNING; theoretical → don't report.

## Quality bar
- Precision over volume. No style nits, no "might be slow/wrong" without a
  mechanism, no issues already handled elsewhere in the code.
- Report only DISTINCT issues; there is no minimum, target, or maximum count.
- Review the **changed lines**. Untouched code around them is context; report an
  issue there only if it is CRITICAL — it will be listed as *pre-existing* and never
  blocks this PR.
