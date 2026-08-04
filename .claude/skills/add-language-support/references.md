# References — the Go implementation this skill is distilled from

## Canonical worked example

- **`docs/go-language-support-plan.md`** — the full plan, phase by phase,
  with an "Implementation notes" section per phase written *after* that
  phase actually shipped (not speculative). Read this in full before
  starting a new language — it has the reasoning this skill only
  summarizes.

## File map — where the Go implementation actually landed

Current as of the Go work; a new language should produce the same shape
(file paths, not line numbers — those drift):

| Concern | File |
|---|---|
| Language registry (single source of truth) | `server/src/modules/repo-intel/languages/index.ts` |
| Language-agnostic tree helpers | `server/src/adapters/astgrep/shared.ts` |
| TS/JS AST parser | `server/src/adapters/astgrep/langs/typescript.ts` |
| Go AST parser | `server/src/adapters/astgrep/langs/go.ts` |
| AST dispatcher (thin, per-language switch) | `server/src/adapters/astgrep/index.ts` |
| TS/JS regex fallback | `server/src/adapters/codeindex/extract.ts` |
| Go regex fallback | `server/src/adapters/codeindex/extract-go.ts` |
| Regex-fallback dispatch (ripgrep adapter) | `server/src/adapters/codeindex/ripgrep.ts` |
| TS/JS import graph | `server/src/adapters/depgraph/index.ts` (`DepCruiseGraph`) |
| Go import graph | `server/src/adapters/depgraph/go.ts` (`GoDepGraph`) |
| Import-graph composition | `server/src/adapters/depgraph/union.ts` (`UnionDepGraph`) |
| DI wiring | `server/src/platform/container.ts` (`get depgraph()`) |
| Per-diff prompt framing (zero-change, registry-driven) | `server/src/modules/reviews/helpers.ts` (`buildStackFraming`) |
| Repo language persistence (zero-change, registry-driven) | `server/src/modules/repo-intel/pipeline/full.ts`, `pipeline/incremental.ts`, `server/src/db/schema/repo-intel.ts` |
| Native-dep build-script approval | `server/pnpm-workspace.yaml` (`allowBuilds`) |

## Test map

| Concern | File |
|---|---|
| AST parser unit tests | `server/test/astgrep-go.test.ts` |
| Regex-fallback unit tests | `server/test/extract-go.test.ts` |
| Registry unit tests (language-count-agnostic) | `server/test/languages.test.ts` |
| Import-graph unit tests | `server/test/depgraph-go.test.ts` |
| Full-pipeline integration test | `server/test/repo-intel-go.it.test.ts` |
| Prompt-framing unit tests (registry-driven, no per-language file needed) | `server/test/stack-framing.test.ts` |

## `server/INSIGHTS.md` entries this skill was distilled from

Dated entries under **Codebase Patterns**, **Tool & Library Notes**, and
**Recurring Errors & Fixes** in `server/INSIGHTS.md`, written during the Go
implementation (search for `2026-08-04`) — the pointer-type bug, the 5th
`SUPPORTED_EXT` consumer, the `pnpm-workspace.yaml` `allowBuilds`
discovery, and the `pnpm typecheck` test-fixture blind spot all originated
there before being generalized into this skill.

## Related skill

- [engineering-insights](../engineering-insights/SKILL.md) — run after
  implementing a new language to capture anything genuinely
  language-specific (not generalizable into this skill) into
  `server/INSIGHTS.md`.
