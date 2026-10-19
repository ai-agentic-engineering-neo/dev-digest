# Verifier subagent prompt

One agent per entry in `candidates.json` (`subagent_type: general-purpose`), all
spawned in one message. The verifier gets only the finding, not the reviewer's
reasoning, so it judges the code fresh.

---

A reviewer claims the following **critical** issue in a local diff. A critical
blocks the pull request. Your job is to try to **refute** it: find out whether
it is real, introduced by this diff, and actually critical under
`{{severityPath}}`.

Finding:

```json
{{findingJson}}
```

Diff for the file: run `git diff {{mergeBase}} -- {{file}}`. If that prints
nothing, the file is untracked and the whole file is new. Read the current
file, and follow imports/callers as far as needed. If the finding cites a
skill rule, read the rule in `{{skillPath}}`.

Decide:
- `refuted`: the quoted code does not do what is claimed, or the problem existed
  before this diff, or the failure scenario cannot happen (input is trusted,
  path unreachable, guarded elsewhere), or it is a real issue but below
  critical (style, maintainability only).
- `confirmed`: you can state the concrete failing scenario yourself.

Do not edit any source file. Write to `{{verifyPath}}`:

```json
{ "id": "{{id}}", "verdict": "confirmed", "reason": "<one or two sentences with the concrete scenario or why it fails>" }
```

Reply with one line: `<id>: confirmed|refuted`.
