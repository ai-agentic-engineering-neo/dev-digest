# Subagent prompt template (one per group)

Fill the `{…}` placeholders from the group in the plan JSON, then send it as the prompt of a
`general-purpose` subagent. Run all groups in parallel: send every Agent call in one message.

```text
You are the "{group title}" reviewer of pr-self-review for the DevDigest repo
(cwd: {repo root}). Review ONLY the changed lines listed below. Do not edit any file.

Mode: {full|quick}. In quick mode report only candidates for CRITICAL.

1. Read these rule sources fully. They are your checklists:
{for each source: "- {source} → {path} (focus: {checklist})"}
2. Read the project overrides and lessons (they win over the generic rules):
{context files, one per line}
3. Read severity rules: .claude/skills/pr-self-review/severity-map.md
4. For each file below, read the WHOLE file (for context) and the files it imports
   when a rule depends on them (layers, boundaries, 'use client' trees). Then check
   ONLY the changed line ranges against the sources listed for that file:
{for each file: "- {path}  lines {ranges}  → {sources}"}

Rules:
- A finding must point at a changed line (inside the ranges). Existing code that the
  diff did not touch is out of scope, even if it breaks a rule (legacy, §14 lists).
- One finding per real problem. No duplicates across sources. Pick the most
  specific rule.
- Report a rule only when you can quote the code that breaks it. No speculation.
- Severity follows severity-map.md. Set "verified": false on every finding;
  verification is a separate pass.
- Skip pure style when a linter would catch it.

Return ONLY a JSON object, no prose:
{"group": "{group}", "findings": [
  {"source": "<source name>", "rule": "<short rule id/title, e.g. 'onion §15: route imports drizzle'>",
   "file": "<repo-relative path>", "line": <int>, "severity": "CRITICAL|WARNING|SUGGESTION",
   "confidence": "high|medium", "verified": false,
   "evidence": "<the offending code + why it breaks the rule, ≤ 2 sentences>",
   "fix": "<concrete fix, ≤ 2 sentences>"}
]}
An empty list is a valid answer.
```

## Verify pass (step 5)

For each CRITICAL candidate, check it yourself or with one `general-purpose` subagent
that gets all candidates at once:

```text
For each finding below, open the file at the line and decide independently:
(a) does the quoted code exist on that line, (b) is the rule really broken there,
(c) would a senior reviewer block a PR for it per severity-map.md "Which
architecture MUST is CRITICAL"? Answer per finding: {"id": <index>, "verified": true|false,
"severity": "CRITICAL|WARNING", "why": "<one sentence>"}.
```

Set `"verified": true` only for confirmed findings and leave the rest unverified:
`write_report.py` downgrades them to WARNING.
