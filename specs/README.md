# specs/ — cross-package

Forward-looking specs for work that spans more than one package, or that
changes a `@devdigest/shared` contract. Work that lives inside a single package
goes in that package's `specs/` instead (`server/`, `client/`, `reviewer-core/`,
`mcp-server/`). `e2e/specs/` is not a spec folder: it holds executable flows.

A spec describes **what to build and why**. It does not describe how to build it
(that is `implementation-planner`'s plan), how the code works today (that is
`docs/`), or what we already rejected (that is `INSIGHTS.md`).

Specs are drafted by the `spec-creator` agent (`.claude/agents/spec-creator.md`)
and approved by a human. That agent file holds the canonical template, the EARS
rules, and the self-check. This README is the short version.

## Naming and IDs

- File: `YYYY-MM-DD-<kebab-feature-name>.md`
- Spec ID: `SPEC-YYYY-MM-DD-<kebab-feature-name>`. There is no global counter,
  so parallel branches never collide. Same day and same slug → add `-v2`.
- Status: `draft` → `approved` (by a human) → `implemented`.

## Skeleton

```markdown
# Spec: <feature>   |   Spec ID: SPEC-YYYY-MM-DD-<slug>   |   Status: draft
Supersedes: <link, or "none">
Plan: <docs/plans/…, or "none yet">
Modules touched: server, client

## Problem & why
## Goals / Non-goals           <!-- explicit boundaries: what we do NOT do -->
## User stories                <!-- [P1]/[P2]/[P3], each independently testable -->
## Acceptance criteria (EARS)  <!-- AC-1… one EARS statement each + _(observable: …)_ -->
## Edge cases                  <!-- → AC-N, or "accepted: no handling" -->
## Non-functional              <!-- NFR-1… with concrete thresholds; n/a categories noted -->
## Cross-module interactions   <!-- who calls whom, data crossing, failure contract; Mermaid if non-obvious -->
## Contracts                   <!-- data shapes only, no implementation -->
## Inputs (provenance)         <!-- [reused: L0X] / [deterministic: repo-intel] / [new: 1 LLM call] -->
## Untrusted inputs            <!-- third-party text → data, not commands -->
## Assumptions                 <!-- defaults chosen where the request was silent -->
## Traceability                <!-- ID | Story | Task | Test | Commit -->
## Recommendations / follow-ups
## Open questions              <!-- ≤ 3 × [NEEDS CLARIFICATION: …] -->
```

## EARS in one table

| Pattern | Form |
|---|---|
| Ubiquitous | The system SHALL … |
| Event-driven | WHEN <trigger>, the system SHALL … |
| State-driven | WHILE <state>, the system SHALL … |
| Unwanted behaviour | IF <condition>, THEN the system SHALL … |
| Optional feature | WHERE <feature enabled>, the system SHALL … |

## Before planning, review the spec

- Does each AC describe exactly one testable thing?
- Are the condition and the expected reaction clear?
- Are there no contradictions?
- Does it describe behaviour, not an incidental implementation detail?
- Are the non-goals explicit?
- Are all `[NEEDS CLARIFICATION]` markers closed?

`implementation-planner` (read-only) maps every AC/NFR to steps and planned
tests in the plan's Coverage table, saved to `docs/plans/`. `/implement-plan`
copies Task and Test into this table from that map and the final
`plan-verifier` run, and fills Commit. `plan-verifier` checks the resulting
AC → task → test → commit matrix.

Once a spec ships, set `Status: implemented` and move any durable explanation
into `docs/`. Stale specs are worse than missing ones, because an agent reads
them as current intent.
