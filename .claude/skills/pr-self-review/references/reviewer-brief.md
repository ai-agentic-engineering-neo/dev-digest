# Reviewer brief (subagent prompt)

The orchestrator fills the `{…}` slots and passes the text as the `prompt` of an
`Agent` call (`subagent_type: "general-purpose"`). Spawn the frontend and the
backend reviewer **in the same message** so they run in parallel. A subagent
starts cold: everything it needs is in the brief.

---

You are the **{frontend|backend} reviewer** of a local pre-PR self-review in the
DevDigest repo (`{repo root}`). You review, you do not edit any file.

**Scope.** Only these files, and only the lines this diff adds or changes:

```
{one path per line, from collect-diff.sh, kind code|test|config}
```

Get the diff of a file with:
`git diff -M -U3 {base} -- <path>` (for a renamed file, pass the old path too:
`git diff -M -U3 {base} -- <old path> <path>`); untracked files are new in full.
Read surrounding code only as far as needed to judge a changed line.

**Rules to apply.** Read, in this order, only what applies to your files:

1. `.claude/skills/pr-self-review/references/severity.md` — the only scale you use.
2. `.claude/skills/pr-self-review/references/routing.md` — your area's table;
   load only the listed sections of the listed skills (`.claude/skills/<name>/`).
3. `{package}/INSIGHTS.md` for each touched package, and the root `INSIGHTS.md`.
4. `.claude/skills/pr-self-review/references/coupled-files.md`.

**Deterministic results already known** (do not re-run tools, do not re-report
these; confirm or dismiss the SIGNAL lines, they are grep hints):

```
{precheck lines for your area: CRITICAL / MAJOR / SIGNAL}
```

**Do not report:**

- debt that exists on the base branch (arch baseline, onion-architecture §10,
  INSIGHTS entries describing current code) unless this diff makes it worse;
- formatting, import order, or anything a typechecker already enforces;
- Zod 4 suggestions (the repo is Zod 3);
- the same issue twice — one finding, list the other locations in `also`.

**Output.** Reply with ONLY a JSON object, no prose around it:

```json
{
  "area": "frontend",
  "reviewed": ["client/src/…/X.tsx"],
  "signals": [
    { "id": "routes-query-db server/src/modules/pulls/routes.ts:170", "confirmed": true, "note": "…" }
  ],
  "findings": [
    {
      "severity": "CRITICAL",
      "code": "C8",
      "file": "server/src/modules/pulls/routes.ts",
      "line": 264,
      "also": [],
      "rule": "onion-architecture §6 — multi-table write without a transaction",
      "problem": "deletes pr_files then inserts; a throw between them serves a PR with no files",
      "failure_scenario": "GitHub returns files, insert of pr_commits fails → pr_files already deleted",
      "fix": "fetch first, then wrap the four writes in one transaction via UnitOfWork"
    }
  ]
}
```

`severity` is one of CRITICAL, MAJOR, MINOR, NIT. `code` is the row id from
severity.md for CRITICALs (C6–C13), otherwise omit it. Every CRITICAL needs a
concrete `failure_scenario`; if you cannot write one, it is a MAJOR.
