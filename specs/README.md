# specs — cross-module

Specs of features that touch **two or more modules** (`server`, `client`, `reviewer-core`, `mcp-server`,
`e2e`). A feature that touches one module keeps its spec in `<module>/specs/`. `docs/` describes how
existing code works, `specs/` what to build; `plans/` says how and in what order.

## Which folder

| The feature touches | Spec goes to |
|---|---|
| ONE module | `<module>/specs/<feature>.md` (`server` · `client` · `reviewer-core` · `mcp-server`; never `e2e/specs/` — those are executable flows) |
| TWO or more modules | ONE file here: `specs/<feature>.md` — never split per module; each touched module's `specs/README.md` gets a "see also" line pointing here |

## How specs are written

- By the [`spec-creator`](../.claude/agents/spec-creator.md) agent, BEFORE implementation, from its
  template (Problem · Goals/Non-goals · User stories · Acceptance criteria (EARS) · Edge cases ·
  Non-functional · Inputs (provenance) · Untrusted inputs · Module interactions · Design review ·
  `[NEEDS CLARIFICATION]`). EARS patterns and examples: the same file, Step 4.
- **Numbering:** `Spec ID: SPEC-NN` is unique across the whole repo (`specs/` + every `*/specs/`).
  Criteria are `AC-1, AC-2…` inside a spec, referenced from plans and reports as `SPEC-NN/AC-n`.
- **Lifecycle:** `draft` → the user sets `approved` (only when no `[NEEDS CLARIFICATION]` is left) →
  `implemented` (set by `/implement-plan` after `plan-verifier` reports COMPLIANT).
  `implementation-planner` plans only from an approved spec; each plan task has `Covers: SPEC-NN/AC-n`.

## Index

<!-- - [file.md](file.md) — SPEC-NN · server, client · read when … -->
