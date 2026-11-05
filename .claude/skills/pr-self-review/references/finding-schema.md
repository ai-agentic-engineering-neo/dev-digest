# Finding schema + subagent prompts

## Finding (what a reviewer writes)

The reviewer writes a JSON **array** (possibly empty) to its `outputPath`:

```json
[
  {
    "skill": "react-best-practices",
    "rule": "react-best-practices/derive-dont-store",
    "file": "client/src/app/repos/[repoId]/pulls/page.tsx",
    "line": 42,
    "severity": "critical",
    "issue": "filteredPulls is copied into state via useEffect; it goes stale when pulls refetch",
    "evidence": "const [filtered, setFiltered] = useState([]); useEffect(() => setFiltered(pulls.filter(...)), [pulls])",
    "fix": "const filtered = useMemo(() => pulls.filter(...), [pulls]) — or compute inline",
    "onChangedLine": true
  }
]
```

| Field | Rule |
|---|---|
| `skill` | the skill of this task |
| `rule` | stable id `<skill>/<kebab-rule>` — the same problem must get the same id on every run (waivers match on it). Secrets in `security`: the id must contain `secret` (e.g. `security/hardcoded-secret`) — those cannot be waived |
| `file` | repo-relative posix path, one of the task's files |
| `line` | 1-based line in the **current** file; `null` only for file-level findings |
| `severity` | `critical` \| `high` \| `medium` \| `low` per `severity-rubric.md` |
| `issue` | one sentence: what is wrong and what breaks |
| `evidence` | the offending code (≤ 2 lines) |
| `fix` | concrete change, not "consider…" |
| `onChangedLine` | informative only — the script recomputes it from the diff |

No prose outside the JSON. No duplicate findings for the same line and rule.

## Reviewer prompt (one agent per task in `plan.json → tasks`)

Fill `{…}` from the task and send it with `subagent_type: "general-purpose"`:

```text
You are a code reviewer applying ONE skill to a slice of a local diff, before a PR is opened in the
DevDigest repo (root: {ROOT}).

1. Read the skill: {skillPath} (and any reference file it points to that is relevant to these files).
2. Read the package insights: {insights | "none"}. They are known pitfalls of THIS repo — a violated
   entry is at least `high`.
3. Read the severity rubric: .claude/skills/pr-self-review/references/severity-rubric.md
   and the output schema: .claude/skills/pr-self-review/references/finding-schema.md (section "Finding").
4. Read the diff slice: {slicePath}. It lists every file with its changed line ranges. Read the full
   current file whenever context beyond the hunk matters.
5. Review ONLY these files: {files}. Report problems on CHANGED lines (or caused by them). Apply only
   rules of this skill that fit this stack and the repo's CLAUDE.md conventions.
6. Write a JSON array of findings (possibly []) with the Write tool to: {outputPath}
   Then reply with one line: "<n> findings (<c> critical)". Do not edit any other file.
```

## Verifier prompt (one agent per id in `merged.json → needsVerification`)

Give the verifier the code and the claim, **not** the first agent's reasoning:

```text
Adversarially verify ONE claimed critical defect in a local diff of the DevDigest repo (root: {ROOT}).
Claim: {issue}
Location: {file}:{line} · rule {rules}
Changed line ranges of this file: {changedLines}

Read the file (and whatever it imports/is imported by, if needed) and decide:
- is the defect real (it will break build/runtime, is exploitable, or violates the cited rule as the
  rubric .claude/skills/pr-self-review/references/severity-rubric.md defines "critical")?
- is it on, or caused by, a changed line?
Default to "not confirmed" if you cannot reproduce the reasoning from the code itself.

Write with the Write tool to .claude/pr-self-review/run/verify/{id}.json:
{"id": "{id}", "confirmed": true|false, "onChangedLine": true|false, "reason": "<one sentence>"}
Reply with one line: "{id}: confirmed|rejected".
```
