# <Language> language support — plan

**Status:** not started.

Copy this into `docs/<language>-language-support-plan.md` (kebab-case
language name) per this repo's root `CLAUDE.md` "Feature planning"
convention, and fill in every `<...>` placeholder with verified facts —
not assumptions. See the `add-language-support` skill for the full
rationale behind each step, and `docs/go-language-support-plan.md` for a
completed worked example.

## Context

<Why this language, why now — one or two sentences.>

## Pre-flight research (do this before writing the rest of the plan)

- **ast-grep support**: `@ast-grep/napi`'s built-in `Lang` enum
  includes/does not include `<language>`. <If not:> a dynamic-grammar
  package `@ast-grep/lang-<id>` exists on npm — confirmed via
  `npm view @ast-grep/lang-<id>` — <yes/no, version>.
- **Grammar field names**: verified against a live parse (a throwaway
  script parsing real `<language>` source and printing `node.kind()` /
  `node.field(...)` / `node.children()`), not just the grammar's
  `node-types.json` or published docs. Key node kinds found:
  - Function/method declaration: `<kind>`
  - Type/class/struct declaration: `<kind>`
  - Call expression: `<kind>`, callee field: `<field name>`
  - Member/field access: `<kind>`, object field: `<field name>`, property
    field: `<field name>`
  - Import/module declaration: `<kind>`
  - <Anything structurally different from TS/JS or Go — e.g. how
    exported-ness is represented, if at all.>
- **Import resolution model**: file-granular (like TS/JS) or
  package/module-granular (like Go)? Is there a manifest file that maps an
  import path to a local directory (`go.mod`, `Cargo.toml`, ...), or none
  (like C/C++'s compiler-search-path-dependent `#include`)? If none, the
  import-graph step below may be skipped — say so explicitly, don't ship
  silent zero-coverage.

## Plan

1. **Registry entry** — add `{ id: '<id>', label: '<Label>', extensions:
   [...] }` to `server/src/modules/repo-intel/languages/index.ts`.
2. **AST parser** — `server/src/adapters/astgrep/langs/<id>.ts` +
   dispatcher wiring in `astgrep/index.ts` (4 switch statements +
   `langForFile` chain).
3. **Regex fallback** — `server/src/adapters/codeindex/extract-<id>.ts` +
   dispatch wiring in `ripgrep.ts` (refactor the TS/Go ternary into a real
   per-language dispatch once this is the 3rd language).
4. **Import graph** — `server/src/adapters/depgraph/<id>.ts` (or explicitly
   "skipped, no manifest-based resolution" per the pre-flight research
   above) + added to `UnionDepGraph`'s default builder array.
5. **Native dependency approval** — resolve any new `pnpm-workspace.yaml`
   `allowBuilds` placeholder.
6. **Consumer discovery** — run `pnpm typecheck` after step 1 and after
   each subsequent step; do not rely on grep alone.
7. **Prompts** — confirm zero changes needed (registry-driven); sanity-check
   the new `label` reads naturally in the stack-framing line.
8. **`repo_index_state.languages`** — confirm zero changes needed
   (registry-driven).
9. **Tests**:
   - `server/test/astgrep-<id>.test.ts`
   - `server/test/extract-<id>.test.ts`
   - `server/test/depgraph-<id>.test.ts` (if step 4 shipped a real builder)
   - `server/test/repo-intel-<id>.it.test.ts` (real Postgres, ≥2 local
     files importing each other)
10. **Docs + insights** — keep this file's `**Status:**` line current as
    phases land; run the `engineering-insights` skill after implementation.

## Out of scope

`reviewer-core/` and `client/` need zero changes — both are already
language-agnostic (confirmed true for Go; re-verify if this language
needs something genuinely new from either, e.g. syntax highlighting).

## Implementation notes — <phase>

<Fill in per phase, after it ships — what was verified, what deviated from
the plan above and why, what's genuinely new vs. reused from the Go
pattern. Mirror docs/go-language-support-plan.md's "Implementation notes"
sections.>
