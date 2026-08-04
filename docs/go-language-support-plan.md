# Go language support — analysis + plan

**This plan is the canonical worked example for the `add-language-support`
skill** (`.claude/skills/add-language-support/`) — the findings below (the
pointer-type bug, the 5th `SUPPORTED_EXT` consumer, the per-language-module
design decision, etc.) were distilled into that skill so the next language
(Rust, C++, ...) starts from a checklist instead of rediscovering the same
lessons. Read that skill first if you're adding a new language; read this
doc for the full phase-by-phase reasoning behind it.

## Context

DevDigest's review pipeline is JS/TS-only today. This doc analyzes exactly
where that coupling lives and lays out a phased plan to add a second
language pack, starting with Go, without regressing the existing TS/JS path.

## Where JS/TS coupling actually lives

The coupling is concentrated in one layer, not spread evenly across the
codebase.

**`reviewer-core/` — already language-agnostic, no changes needed.**
Diff→prompt→LLM→grounding treats the diff as opaque text keyed by line
number. There is no `language` field/enum anywhere. `repoMap`/`callers` are
just strings handed to it by the server — reviewer-core never inspects their
contents.

**`client/` — already language-agnostic, no changes needed.**
The diff viewer renders plain text lines, uses a single generic
`Icon.FileText` for every file, and has no syntax-highlighting library
(no Prism/Shiki/Monaco/CodeMirror).

**`server/` — the coupling, and it's triple-duplicated:**

- `server/src/modules/repo-intel/constants.ts:14` —
  `SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']`, the
  allowlist driving `walk.ts`, `service.ts`, `incremental.ts`.
- `server/src/adapters/codeindex/ripgrep.ts:25` — a **second**,
  independently duplicated `CODE_EXT` allowlist.
- `server/src/adapters/astgrep/index.ts` — real tree-sitter parsing via
  `@ast-grep/napi`. `langForFile()` (lines 57-76) only recognizes
  `TypeScript`/`Tsx`/`JavaScript`; everything else returns `null` and is
  silently skipped. `parseSymbols`/`parseReferences`/`parseImports` are
  built entirely on JS/TS grammar node kinds (`function_declaration`,
  `class_declaration`, `jsx_opening_element`, `import_statement`, ...) plus
  a hardcoded JS `KEYWORDS` set.
- `server/src/adapters/codeindex/extract.ts` — the regex fallback
  extractor, explicitly documented as "for TS/JS"; patterns match
  `function`/`class`/`interface`/`enum` keywords verbatim.
- `server/src/adapters/depgraph/index.ts` — the import graph is built via
  `dependency-cruiser`, which looks for `tsconfig.json` and resolves
  modules using Node/npm rules. There is no equivalent for Go.
- `server/src/db/seed-prompts.ts:12-13,191` and
  `docs/agent-prompts/general-reviewer.md` / `performance-reviewer.md` — the
  seeded system prompts literally open with "You are reviewing a
  pull-request diff for a **Node.js (TypeScript, ESM) service**". This is
  live prompt content sent to the LLM, not just docs.
  `docs/agent-prompts/security-reviewer.md` is already language-neutral —
  a ready template for how the others should read.
- No DB table (`repos`, `repo-intel.ts` schema) has a `language` column —
  it only exists implicitly via `SUPPORTED_EXT`.

**Verified constraint:** `@ast-grep/napi@0.43.0` (already a dependency)
ships a built-in `Lang` enum of only `Html | JavaScript | Tsx | Css |
TypeScript` — Go isn't included out of the box. ast-grep's core (Rust/CLI)
does support Go, and the napi package exposes `registerDynamicLanguage()`
for loading other tree-sitter grammars via separate `@ast-grep/lang-*`
packages (see the `ast-grep/langs` repo). Whether a prebuilt
`@ast-grep/lang-go` exists needs to be checked at implementation time; if
not, an alternative (compile the grammar ourselves, or ship regex-only
support for v1) is needed.

## Polyglot repos (e.g. TypeScript + Go in the same repo)

The Phase 0 registry is already per-file (dispatched by extension), not
per-repo, so mixed-language repos work by construction at the
walk/parse/symbol layer: each file is handled by whichever language pack
matches its extension, and files with no matching pack are silently
skipped — exactly like today's behavior for extensions outside
`SUPPORTED_EXT`. Three places still need an explicit polyglot-aware design,
called out in their phases below:

- **Phase 3 (import graph)** — no single depgraph builder; dispatch
  per-language and union the results.
- **Phase 4 (system prompts)** — frame the review by the languages actually
  touched in *this* diff, not by a single repo-wide stack label.
- **Phase 5 (language detection)** — store a set, not a scalar.

## Plan (phased, Go as the first language pack)

### Phase 0 — make "language" an explicit concept
Replace the three independent allowlists (`repo-intel/constants.ts`,
`ripgrep.ts`, `astgrep langForFile`) with one registry, e.g.
`server/src/modules/repo-intel/languages/`:

```
{ id: 'go', extensions: ['.go'], astGrepLang: 'go' (dynamic) }
{ id: 'ts', extensions: ['.ts','.tsx','.js','.jsx','.mjs','.cjs'], astGrepLang: Lang.TypeScript/Tsx/JavaScript }
```

This removes the "added Go to one allowlist, forgot the other two" risk —
which is exactly the current state for TS/JS (3 copies of the same list).

### Phase 1 — generalize `astgrep/index.ts` instead of forking it for Go
Rather than a parallel ~600-line Go-specific file, extract a per-language
"node-kind mapping" config (which grammar node name means
function/class/interface/call/import in this language) and make
`parseSymbols`/`parseReferences`/`parseImports` read from that config. Tree
walking, dedup, and signature trimming (`headSignature`) stay shared.
Go-specific mapping needed: `function_declaration`/`method_declaration`
(receiver), `type_declaration` → `struct_type`/`interface_type`,
`call_expression` with `selector_expression` (Go's analogue of
`member_expression`), no `new_expression` (Go's `new(T)` is a plain call),
imports via `import_spec` inside an `import (...)` block.

### Phase 2 — regex fallback for Go
Mirror `codeindex/extract.ts` for Go, so indexing degrades gracefully (same
"never throw, degrade to partial" principle already used for TS/JS) if the
ast-grep dynamic-language load fails on a given platform.

### Phase 3 — import graph without dependency-cruiser
The riskiest part: no off-the-shelf npm tool resolves Go imports. Realistic
v1: parse `import (...)` blocks (already produced by Phase 1/2), read the
module path from `go.mod`, map each imported package path to a local
directory in the repo, and build file-edges the same way as today
(`fileEdges.fromFile/toFile`). Nuance: Go resolves at the **package**
(directory) level, not the file level — needs an explicit decision on
whether an edge points at "any file in that package" or whether the schema
should aggregate at directory granularity.

**Polyglot repos:** `DepGraph` stops being one implementation
(`DepCruiseGraph`) and becomes a per-language dispatch — each builder
(`dependency-cruiser` for TS/JS, the new resolver for Go) runs scoped to
only the files of its own language, and the container's `depgraph` port
unions the edge lists. Cross-language edges (Go importing a `.ts` file)
aren't a real case to support — the two subgraphs stay disjoint, which
PageRank handles fine as separate components with no special-casing needed
in `rank.ts`.

### Phase 4 — de-hardcode the system prompts
Remove the fixed "Node.js (TypeScript, ESM)" framing from
`seed-prompts.ts` and `docs/agent-prompts/{general,performance}-reviewer.md`
— rewrite neutrally (following the already-neutral
`security-reviewer.md`).

**Polyglot repos:** don't substitute a single repo-wide stack label at
prompt-assembly time — a repo-level `languages[]` (Phase 5) would wrongly
frame a Go-only PR in a TS+Go repo as a "Node.js service" review. Instead,
derive the stack framing from the languages of the files actually **in
this diff** (same per-file extension lookup as Phase 0), computed at
review-run time, not index time. A PR touching only `.go` files gets Go
framing; a PR touching both `.ts` and `.go` files mentions both stacks (or
falls back to the neutral framing when the mix is wide).

### Phase 5 — repo language detection
At clone/index time, detect the repo's languages via marker files (`go.mod`,
`package.json`/`tsconfig.json`), and persist the result as
`languages: string[]` — **a set, not a scalar** — on a new column on `repos`
or `repo_index_state`. A repo can legitimately have both markers present at
once (e.g. this very repo: `client/` is TS, a Go service could sit
alongside it); the field exists for informational use (badge, filtering),
never as a gate that picks one indexing path over another — indexing
already runs per-file per Phase 0.

### Phase 6 — tests
Go fixtures under `server/test` (a small `go.mod` repo), unit tests for the
Go `parseSymbols`/`parseReferences`/`parseImports` config, and an
integration test that indexes a Go repo end-to-end.

## Out of scope
`reviewer-core/` and `client/` need zero changes — both are already
language-agnostic.

## Implementation notes — Phase 0+1+2 (this iteration)

**Status: Phase 0+1+2 done and merged** (fork PR #3, branch
`docs/go-language-support-plan`) — registry, real Go AST parsing via
`@ast-grep/lang-go`, regex fallback, and test coverage (unit:
`astgrep-go.test.ts`/`extract-go.test.ts`/`languages.test.ts`; integration:
`repo-intel-go.it.test.ts` indexes a real Go fixture end-to-end against
Postgres). **Phase 3 (import graph) done.** **Phase 4 (de-hardcode system prompts)
done.** **Phase 5 (repo language detection) done.** All 6 phases are now
complete — Phase 6 (tests) was covered incrementally alongside each phase
rather than as a separate final pass; see each phase's own "Tests:" note
above. **Phase 6 audit (post-completion): one real gap found and fixed —
see "Implementation notes — Phase 6 audit" below.**

Verified against the actual codebase and the real `@ast-grep/lang-go`
package before implementing (not trusted from the analysis above as-is):

- `@ast-grep/lang-go@0.0.6` exists on npm — the "needs to be checked"
  risk flagged above is resolved. Its `index.js` already exports the exact
  `{ libraryPath (getter), extensions, languageSymbol, expandoChar }` shape
  `registerDynamicLanguage()` expects and resolves the platform prebuilt
  binary itself — no manual native-path resolution needed on our side.
- Real tree-sitter-Go field names, read from the package's own
  `node-types.json`: `call_expression{function}`,
  `selector_expression{operand,field}`,
  `method_declaration{name,receiver,body,parameters,result}`,
  `type_declaration` → `type_spec{name,type}`, `import_declaration` →
  `import_spec{name?,path}` (possibly nested in `import_spec_list`),
  `pointer_type` wraps a bare `_type` child. Go's grammar reuses the
  `identifier`/`type_identifier` leaf-kind names TS/JS already uses.
- Two gaps in the "triple-duplicated" framing above, corrected: `astgrep/
  index.ts` is a **4th** consumer of `SUPPORTED_EXT` beyond the three named
  (`walk.ts`/`service.ts`/`incremental.ts`); it also has a **4th** function
  with the same hardcoded-node-kind structure as `parseSymbols`/
  `parseReferences`/`parseImports` — `parseInvocationHeads()` (the
  phantom-gate's call-head extractor) — needing the same per-language
  treatment.
- Real gap in the fallback wiring: `codeindex/ripgrep.ts`'s `symbols()`/
  `references()` call the TS/JS regex extractor **unconditionally** for any
  file passing the extension gate (today that gate only ever admits TS/JS).
  Once the gate also admits `.go`, this call site needs explicit language
  dispatch or Go files silently run through TS/JS regexes.

**Design decision — per-language modules, not one generic node-kind config
object** (this iteration deviates from the sketch above): TS/JS and Go
differ structurally, not just in kind-name spelling — TS/JS tracks
"exported" via an `export` keyword node; Go's exported-ness is a naming
convention (`/^[A-Z]/`), not an AST fact at all. TS/JS member access is
`member_expression{object,property}`; Go's is
`selector_expression{operand,field}` — different field names, not
substitutable via a lookup table. A single generic walker parameterized by
kind-name mapping would need to grow into most of a second interpreter to
cover this. Instead: extract the genuinely language-agnostic tree helpers
(`headSignature`, `lineOf`, `endLineOf`, `childrenOfKind`, `getField`,
`dedupe` — none of these reference a TS/JS-specific kind name today) into
`astgrep/shared.ts`, then give TS/JS and Go their own concrete
`parseSymbols`/`parseReferences`/`parseInvocationHeads`/`parseImports`
implementations (`astgrep/langs/typescript.ts`, `astgrep/langs/go.ts`)
built on those shared primitives. `astgrep/index.ts` stays a thin
dispatcher — the public API and every existing caller are unchanged.

Full implementation-level plan (files, signatures, exact Go AST shapes)
lives in the plan-mode session that scoped this iteration; see git history
for the corresponding commits.

## Implementation notes — Phase 3 (import graph)

**Status: done.** `DepCruiseGraph` (TS/JS) is untouched; a new
`GoDepGraph` (`server/src/adapters/depgraph/go.ts`) handles Go, and both
are composed by a new `UnionDepGraph`
(`server/src/adapters/depgraph/union.ts`) that the container now binds
instead of `DepCruiseGraph` directly
(`server/src/platform/container.ts:123`) — the port interface and both
existing call sites (`pipeline/full.ts:216`, `pipeline/incremental.ts:219`)
are unchanged, since they already pass the full multi-language file list
and let the adapter filter internally (the same pattern `DepCruiseGraph`
already used for TS/JS).

`GoDepGraph.buildEdges`:
- Filters `files` to `.go` files via `languageIdForFile`. Returns `[]`
  immediately if there are none — no `go.mod` read attempted.
- Reads `go.mod` from `root` and extracts the `module <path>` directive via
  a line-anchored regex. No `go.mod` (or no `module` line) → `[]` for the
  whole build, since there's no way to tell a local import from a
  third-party one without it. This is a real v1 limitation, not a bug: a
  Go file tree with no `go.mod` at the repo root (e.g. `go.mod` in a
  subdirectory of a monorepo) produces zero edges.
- For each Go file, parses its imports via the existing
  `astgrep/index.ts` `parseImports` dispatcher (already built in Phase 1) —
  no new parsing code needed, Phase 3 is a pure downstream consumer of
  Phase 1's output.
- **Resolved the plan's "file vs. directory granularity" question**:
  edges point at *every* already-walked Go file in the imported package's
  directory, not one representative file. A single `import` statement
  pulls in the whole target package, so under-connecting (picking one
  file) would make PageRank undercount a package's real fan-in.
- Non-local imports (stdlib, third-party module paths) are silently
  skipped — mirrors `DepCruiseGraph`'s existing "local files only"
  contract for TS/JS.

**Polyglot union**: `UnionDepGraph` takes an array of `DepGraph`
(defaulting to `[DepCruiseGraph, GoDepGraph]`), runs them in parallel over
the same `(root, files)`, and concatenates results — no cross-language
edges are possible since each builder only ever emits edges between files
of its own language. `rank.ts` needed zero changes: it already treats
`file_edges` as an opaque edge list and lets `graphology`/PageRank handle
disconnected components.

Tests: `server/test/depgraph-go.test.ts` (hermetic, on-disk fixture) covers
local-package edge fan-out, stdlib-import exclusion, self-edge exclusion,
no-Go-files, and missing-`go.mod` cases, plus `UnionDepGraph`'s
concatenation behavior. `server/test/repo-intel-go.it.test.ts` was
extended with a second local package (`internal/util`) imported by
`main.go`, asserting the resulting `file_edges` row lands in Postgres via
the real `runFullIndex` pipeline.

## Implementation notes — Phase 4 (de-hardcode system prompts)

**Status: done.** Two changes, matching the two things that were actually
wrong: a static prompt that named the wrong stack, and no mechanism at all
for per-diff stack framing.

**Static prompt rewrite** — `GENERAL_REVIEWER_PROMPT` and
`PERFORMANCE_REVIEWER_PROMPT` (`server/src/db/seed-prompts.ts`, mirrored in
`docs/agent-prompts/{general,performance}-reviewer.md`) opened with "You
are ... reviewing a pull-request diff for a Node.js (TypeScript, ESM)
service" and a "# Stack context (assume this unless the diff shows
otherwise)" block naming DevDigest's own dependencies (Fastify, Drizzle,
postgres-js, octokit, simple-git, ripgrep, p-queue) as if they were a fact
about *any* reviewed repo — including one specific, concrete error: "With
max ~10 connections this stalls the whole service" is DevDigest's own pool
size, asserted as true of the target repo being reviewed. Rewrote both to
match `SECURITY_REVIEWER_PROMPT`'s already-neutral style: a stack-agnostic
role sentence + a "# Stack context" instruction to infer the stack from the
diff itself rather than assume one. `PERFORMANCE_REVIEWER_PROMPT`'s
checklist section headers/bullets (`## 1. Database (Drizzle / postgres-js /
Postgres)`, `## 4. Event loop & memory (Node)`) were similarly genericized
to name patterns (N+1 queries, connection-pool starvation, event-loop/
goroutine blocking) rather than DevDigest's specific libraries, keeping
concrete technology names only as illustrative examples. Verified the
`.ts`/`.md` mirrors are still byte-identical (was already true pre-change,
confirmed no test pins the exact prompt text — see the plan-mode research
for this iteration).

**Per-diff dynamic framing** — the static rewrite alone leaves the model
with *no* stack information at all, which is worse than a wrong guess for
a monolingual repo. `reviewer-core` intentionally has no `language`
concept anywhere in its types (confirmed: `ReviewInput`/`PromptParts` have
no such field) and its system message is exactly `agent.systemPrompt +
INJECTION_GUARD` with no templating hook — so per-run framing has to be
assembled server-side, before the `reviewPullRequest()` call, as plain
text folded into the `systemPrompt` string itself rather than a new
reviewer-core field (keeps Phase 4 change local to `server/`, matches this
doc's "Out of scope: reviewer-core needs zero changes"). New pure
`buildStackFraming(changedFiles)` (`server/src/modules/reviews/helpers.ts`,
alongside the existing pure `taskLine` helper — kept a standalone exported
function rather than a private class method specifically so it's directly
unit-testable without constructing a `ReviewRunExecutor`) maps every
`diff.files[].path` through `languageIdForFile` (already built in Phase 0),
dedupes into a set of touched language ids, and renders a `# Languages in
this diff` line (capped at 3 languages before falling back to a generic
"multiple languages" phrase). `ReviewRunExecutor.runOneAgent`
(`server/src/modules/reviews/run-executor.ts`) calls it and appends the
result to `agent.systemPrompt` before the `reviewPullRequest()` call.
Computed **per run, from the diff actually being reviewed** — not a
repo-wide label — so a Go-only PR in a mixed TS+Go repo gets Go framing
and a mixed PR gets both, per this doc's original polyglot note for this
phase. `LanguageDef` gained a `label` field
(`server/src/modules/repo-intel/languages/index.ts`) as the single source
of truth for the human-readable name used in this framing line, plus a
`labelForLanguageId()` lookup, rather than a second labels map duplicated
in `helpers.ts`.

Tests: `server/test/stack-framing.test.ts` (new, hermetic) covers TS-only,
Go-only, mixed TS+Go, and no-recognized-language (undefined). The >3-
languages generic-fallback branch is unreachable with only 2 languages
currently registered — left uncovered rather than tested via a contrived
mock, and worth revisiting once a 3rd+ language pack exists.

## Implementation notes — Phase 5 (repo language detection)

**Status: done.** One deliberate deviation from the plan sketch above, and
one genuinely new column.

**Marker files → derived from the indexed file set.** The plan originally
suggested detecting languages via `go.mod`/`package.json`/`tsconfig.json`
marker files. Implemented differently: `languagesPresent(files)`
(`server/src/modules/repo-intel/languages/index.ts`) derives the set from
`languageIdForFile` over the *actual walked/indexed file list* instead —
`walk.files` in `runFullIndex`, `allFiles` in `runIncremental` (both
already computed for other T3 steps, so this is free). Reasoning: a marker
file answers "what does this repo claim to contain" (a `go.mod` can exist
with zero `.go` files actually indexed, e.g. an empty scaffold or a
walk that skipped everything as oversized) while the indexed-file-derived
set answers "what did we actually index" — strictly more accurate for the
stated purpose (informational badge/filtering), and needs no new
marker-file-parsing code since Phase 0's registry already does the
per-file lookup.

**Schema**: `repo_index_state.languages` — a `jsonb` column typed
`string[]`, defaulting to an empty JSON array
(`server/src/db/schema/repo-intel.ts`), following the existing
`prIntent.inScope`/`outOfScope` precedent (`server/src/db/schema/reviews.ts:55-56`)
rather than a native Postgres array column — no array-column precedent
exists anywhere else in this schema. Migration
`0011_high_zeigeist.sql` (auto-numbered by `drizzle-kit generate`), applied
via `pnpm db:migrate`.

**Write paths**: `IndexStateUpsert.languages` (`server/src/modules/repo-intel/repository.ts`)
threads through `upsertIndexState()`'s insert + `onConflictDoUpdate`.
`runFullIndex` computes it once from `walk.files` right before the final
upsert; the two `safePersist()` early-exit paths (no clone / no files)
always write `[]` since neither has a real walked set. `runIncremental` is
the subtler case: its only full walk (`allFiles`) happens inside a
try/catch around the T3 graph rebuild
(`server/src/modules/repo-intel/pipeline/incremental.ts`), so a transient
failure there must NOT blank out a previously-known-good `languages` set —
`allFiles` is hoisted above the `try` (stays `[]` on failure) and the
final upsert uses `languagesPresent(allFiles)` when the walk succeeded, or
falls back to the prior `state.languages` (already in scope from the
earlier `tryGetIndexState` call) otherwise.

**Read path**: `IndexState` (`server/src/modules/repo-intel/types.ts`)
gained a required `languages: string[]` field, projected in
`tryGetIndexState()`. Confirmed via `pnpm typecheck` (`src/**/*.ts` only —
`server/test/**` is NOT type-checked by this repo's `tsconfig.json`
`include`, so the compiler didn't catch 3 test fixtures that constructed
`IndexState`/`IndexStateUpsert`-shaped literals without the new field;
found and fixed by re-running the full test suite and cross-checking
against the plan-mode research instead) — updated
`repo-intel-resync.test.ts`'s `stateAt()`, `indexer-pipeline.test.ts`'s
`makeInitialState()` and its in-memory repository stub's `upsertIndexState`
(which was silently dropping `languages` before this fix), plus
`service.ts`'s synthesized degraded-state stub (`getIndexState`'s no-row
fallback).

**No consumer yet** — confirmed via the plan-mode research that nothing
reads `languages` downstream today (not in `service.ts`, not in any route,
not in the client's `PrMeta`/repo contracts). Purely informational/future-
use, exactly as the plan text states — the client's `RepoIntelState` hook
(`client/src/lib/hooks/repo-intel.ts`) is the closest existing "badge"
surface but is itself currently unwired to any component, so wiring
`languages` into it wouldn't yet produce a visible UI change without also
building that UI — out of scope here.

Tests: `server/test/languages.test.ts` gained `languagesPresent`/
`labelForLanguageId` unit coverage (dedup, sort, exclude-unrecognized,
empty-input). `server/test/indexer-pipeline.test.ts` asserts
`languages: ['typescript']` after a full index and after an incremental
slice (the latter proving the T3-walk-recompute path, not just the
initial-state passthrough). `server/test/repo-intel-go.it.test.ts` asserts
`languages: ['go']` against a real Postgres row after `runFullIndex` on
the Go fixture.

## Implementation notes — Phase 6 audit (post-completion)

Requested explicitly ("чи все ми виконали для фази 6?") after all 6 phases
were marked done. Re-read the original Phase 6 scope literally — "unit
tests for the Go `parseSymbols`/`parseReferences`/`parseImports` config"
— and noticed it never named `parseInvocationHeads`, the 4th astgrep
function (the phantom-API gate's call-head extractor, already flagged as
an easy-to-miss 4th function back in the Phase 0+1+2 notes above). Checked
whether it had any test coverage at all, for either language.

**Finding: it had none — and that gap was hiding a real bug.**
`server/src/modules/repo-intel/service.ts`'s `getUnresolvedReferences`
(the phantom-API gate) calls `parseInvocationHeads` and filters out
anything in a hardcoded `PHANTOM_GLOBALS_ALLOWLIST` — a pure JS/TS list
(`console`, `Math`, `Buffer`, `fetch`, ...). This allowlist lives in
`service.ts`, one layer above the astgrep dispatcher that Phase 1's
per-language-module refactor covered — so extending `parseInvocationHeads`
to Go in Phase 1 correctly returned bare Go call heads, but nothing
updated this consumer to know Go builtins exist. Verified empirically
(not just by reading the code) with a throwaway script: parsing
`s := make([]int, 0); s = append(s, 1); n := len(s)` returned `make`,
`append`, and `len` as invocation heads, none matched by the TS-only
allowlist — meaning **every ordinary Go file would have `len`/`make`/
`append`/etc. flagged as phantom APIs** in the phantom-gate feature. No
test caught this because `getUnresolvedReferences` itself only had
degraded-contract tests (flag-off, no-clone) — never a single positive-path
test with real source, for either language.

**Fix**: split the allowlist by language
(`TS_PHANTOM_GLOBALS`/`GO_PHANTOM_GLOBALS`/`PHANTOM_GLOBALS_BY_LANGUAGE`,
keyed by `languageIdForFile`), and added Go's predeclared identifiers —
both builtin functions (`len`, `make`, `append`, `panic`, `recover`, ...)
and builtin types used in conversion-call syntax (`string(b)`, `int32(x)`,
...), which are syntactically indistinguishable from a bare call in Go's
grammar and would otherwise ALSO false-positive.

**New test**: `server/test/repo-intel-phantom-gate.test.ts` — the first
positive-path coverage `getUnresolvedReferences` has ever had, for both
languages: confirms a genuinely undeclared/unimported bare call is still
flagged (TS and Go), confirms JS globals / Go builtins / locally-declared
functions are NOT flagged. Verified this test actually catches the bug by
reverting the `service.ts` fix and re-running it before committing — it
failed exactly as expected (`make`/`append`/`len` present in the result).

**Lower-severity, not fixed**: `extractEndpoints`/`extractCrons`
(`adapters/codeindex/extract.ts`) also run unconditionally on every
indexed file, including Go, via `pipeline/full.ts`/`incremental.ts`/
`service.ts`. Their regexes are narrow (`app.get(`-style HTTP verb calls,
`cron.schedule(`-style expressions) and unlikely to match ordinary Go
syntax, but not provably safe the way the phantom-gate bug was provably
unsafe — left as an open question rather than a speculative fix with no
observed false positive to verify against.

**Generalizable lesson, folded into the `add-language-support` skill**: a
per-language-module refactor at one layer (the astgrep adapter) does not
guarantee every *consumer* of that layer's output was updated in lockstep
— a facade sitting above the dispatch (like this allowlist) is exactly the
kind of cross-cutting piece a phase-by-phase, file-by-file plan can miss,
because it isn't "a new language file," it's an existing file whose
implicit language assumption only breaks once a second language actually
exercises it.
