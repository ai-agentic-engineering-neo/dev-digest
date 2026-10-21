# specs — feature specifications

Every feature specification lives in this folder, one file per feature,
written **before** implementation by the `spec-creator` agent
(`.claude/agents/spec-creator.md`) and approved by a human. The per-package
`<package>/specs/` folders hold the *implemented* behaviour written afterwards
by `doc-writer`; `e2e/specs/` holds browser flow contracts. Do not put a new
feature spec anywhere else.

## File and ID

- File name: `<kebab-feature>.md` (`blast-radius.md`), no prefix.
- `Spec ID: SPEC-NN` is global across this folder. The next ID is the highest
  existing number plus one, two digits.
- `Status` moves `draft` → `approved` → `implemented`. `spec-creator` writes
  `draft` only. A human sets `approved`. `doc-writer` sets `implemented` at the
  end of the pipeline, once the package specs exist, changing only the
  `Status:` line here and the status word in the index below.
- `Supersedes` links the spec this one replaces, otherwise `—`.
- English only, whatever language the request or the design came in. The headings below are fixed.

## Body

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <link, when this spec replaces an earlier decision>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
```

## Acceptance criteria: EARS

Every criterion has an ID (`AC-1`, `AC-2`, …), names the user story it serves
(`US-n`), uses the word **shall**, and follows exactly one pattern
(Mavin, Wilkinson, Harwood, Novak, *EARS*, IEEE RE'09):

| Pattern | Form |
|---|---|
| Ubiquitous | The system shall … |
| Event-driven | WHEN `<event>`, the system shall … |
| State-driven | WHILE `<state>`, the system shall … |
| Unwanted behaviour | IF `<condition>`, THEN the system shall … |
| Optional feature | WHERE `<feature is enabled>`, the system shall … |

A requirement that fits no pattern is not yet clear. It goes to
`## Open questions`, not to the criteria.

## Index

<!-- one line per spec: - [`<file>`](<file>) — SPEC-NN · status · one-line summary -->

- [`project-context.md`](project-context.md) — SPEC-01 · implemented · attach a repo's specs/docs/insights Markdown to agents and skills, read at the PR base branch into `## Project context`, with token counts and per-document trace blocks; increment AC-45 to AC-69 (implemented): edit a document and save a local override that runs read
- [`onboarding-tour.md`](onboarding-tour.md) — SPEC-02 · draft · per-repo generated tour (architecture, critical paths, run locally, reading path, first tasks) at `/repos/[repoId]/tour`, grounded in the index and clone, stored and reloaded without a model call, with Regenerate showing model and cost
- [`pr-brief.md`](pr-brief.md) — SPEC-03 · implemented · PR Brief card on the PR Overview tab (verdict, counts and score in code; summary, risk areas and review focus from one stored model call with a trace), references verified against the diff and deep-linked into Files changed
