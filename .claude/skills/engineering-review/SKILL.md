---
name: engineering-review
description: Captures non-obvious engineering insights in the touched package's INSIGHTS.md (server, client, reviewer-core, e2e). Use when a reusable gotcha, working approach, dead-end, codebase pattern, recurring error/fix, or open question surfaces, and again at session wrap-up. Reads existing findings first, avoids duplicates, writes only actionable file-grounded entries, and is strictly append-only.
---
# Engineering Review

## Qualification

Write only findings that match one of these. See `examples.md` for vague-vs-useful examples:

1. **Dead-end / antipattern** — a reasonable approach failed and why.
2. **Meaningful complexity** — a non-obvious codebase behavior, convention,
   dependency, or architectural constraint.
3. **Gotcha** — surprising behavior that required investigation to discover.
4. **Working approach** — a non-obvious successful approach worth repeating.
5. **Open question** — an unresolved issue worth continuing later.

Reject findings that are:

- obvious from the code or existing docs;
- trivial or specific only to the current session;
- vague or unactionable;
- already captured in `INSIGHTS.md`.

A finding must make sense without session context. Include the trigger,
rule/fix, and evidence when available (`file:line`, command, error text,
test result).

If nothing qualifies, make no file changes.

## Target File

Route each finding to the package it concerns:

- `server/` → `server/INSIGHTS.md`
- `client/` → `client/INSIGHTS.md`
- `reviewer-core/` → `reviewer-core/INSIGHTS.md`
- `e2e/` → `e2e/INSIGHTS.md`
- Repo-wide → root `INSIGHTS.md`

For sessions spanning packages, split findings by package.

Use root only when a finding does not belong to one package, such as
`.claude/rules/`, root configuration, cross-package conventions, or CI-wide
behavior.

Do not read or modify unrelated packages' `INSIGHTS.md` files.

If a target file does not exist, create it only when a finding qualifies.

## Sections

Use exactly these sections for new entries:

- `## What Works` — working approach
- `## What Doesn't Work` — dead-end / antipattern
- `## Codebase Patterns` — meaningful complexity
- `## Tool & Library Notes` — third-party tool/dependency gotcha
- `## Recurring Errors & Fixes` — code error/bug and its fix
- `## Session Notes` — qualifying finding that fits no section above
- `## Open Questions` — unresolved question

`Session Notes` is not a session summary. Entries there must still qualify.
Group them under `### YYYY-MM-DD`.

Add only missing sections required by the current findings. Append new section
headings after existing content.

Never rename, reorder, or remove existing headings.

Root `INSIGHTS.md` may contain legacy `## Findings` or
`## Open decision: ...` headings. Leave them untouched and never add new
entries under them.

## Entry Format

Append one bullet under the matching `##` section:

```md id="x7w2kx"
- **YYYY-MM-DD** — <problem / behavior> → <action / rule>. Evidence: `path/file.ts:NN`.
```

Use other concrete evidence when a file/line is not applicable, such as a command,
error string, test result, or commit.

Keep each entry to 1–3 lines and understandable without the original session.

For `Session Notes`, group entries under a dated subheading:

```md id="zg7nfb"
### YYYY-MM-DD
- <qualifying session-specific finding or decision>
```

`Session Notes` is for useful context worth carrying forward that does not yet
establish a reusable rule or fit another section. Do not use it as a general
session summary.

## Constraints

- Append only. Never edit or delete existing entries.
- If an existing entry is wrong or stale, append a correction referencing it.
- If existing entries conflict, do not choose one silently; report the conflict.
- Do not duplicate existing insights or behavior already documented elsewhere.
- If new evidence only reinforces an existing insight, add at most a short
  cross-reference instead of restating it.

## Process

1. Review the conversation and diff for qualifying candidates.
2. Assign each candidate to its target `INSIGHTS.md`.
3. For each target with candidates, read:
   - the complete target `INSIGHTS.md`, if it exists;
   - that package's `CLAUDE.md`;
   - relevant package docs.
   For root candidates, read relevant root `CLAUDE.md`, `README.md`, and
   repo-wide docs.
4. Drop candidates that fail qualification or are already documented.
5. If nothing survives, make no changes and report that nothing qualified.
6. Map each surviving finding to one canonical section.
7. Create the target file if needed, append missing required sections, then
   append entries without changing existing content.
8. Report additions grouped by file and section, plus any conflicts found.