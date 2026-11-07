# Waivers — accepting a false-positive critical

File: `.claude/pr-self-review/waivers.json` (**committed**, so reviewers see every waiver in the diff).

```json
[
  {
    "file": "server/src/modules/reviews/service.ts",
    "rule": "onion/application-no-adapters",
    "line": 42,
    "reason": "legacy import kept until the LLM port lands, issue #15",
    "expires": "2026-12-01"
  }
]
```

| Field | Rule |
|---|---|
| `file` | exact repo-relative path |
| `rule` | exact `rule` id from the report (`onion/…`, `react-best-practices/…`, `policy/…`, `typecheck/TS2322`) |
| `line` | optional; matches ±5 lines so small edits above don't break it. Omit to waive the rule for the whole file |
| `reason` | required — why it is safe, ideally with an issue link |
| `expires` | required, `YYYY-MM-DD`; an expired waiver is ignored with a warning |

Rules:

- A waived finding moves to the **Waived** block, is listed in `pr-summary.md`, and does not count
  toward `critical_count`.
- **Cannot be waived:** `policy/do-not-touch-clones`, `policy/do-not-touch-vendor-shared`, a growing
  `architecture-baseline.json`, and `security` findings whose rule mentions secrets/tokens/keys.
  Exception: `policy/do-not-touch-vendor-shared` IS waivable when the same file changed in both
  `server/src/vendor/shared/` and `client/src/vendor/shared/` and the two are byte-identical (git blobs);
  one copy, differing copies or a deleted copy stay non-waivable. Waive each copy (two entries).
- Claude **never** writes waivers on its own. The report prints a ready-made entry; the user decides
  and adds it.
- `waivers.json` is part of the diff, so adding a waiver changes the diff hash → the gate requires a
  re-run (cheap: everything else comes from the cache).
