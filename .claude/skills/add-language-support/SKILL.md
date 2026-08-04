---
name: add-language-support
description: "Guides adding support for a new programming language to DevDigest's repo-intel indexer — the language registry entry, ast-grep parser module, regex fallback, import-graph builder, and test coverage a new language needs, plus the verification techniques (real-parse-tree checks, typecheck-based consumer discovery) that caught real bugs during the Go implementation. Use when adding, planning, or scoping support for a new language (e.g. 'add Rust support', 'add C++ indexing', 'let's index Python next', 'how do we support a new language') anywhere under server/src/modules/repo-intel or server/src/adapters/{astgrep,codeindex,depgraph}."
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Add Language Support

DevDigest's repo-intel indexer (`server/`) started TS/JS-only. Go was added
as the second language pack — that work discovered exactly where the
language-specific surface area lives and, more importantly, two real bugs
that a checklist alone wouldn't have caught. This skill is that map, updated
with what actually broke.

**Canonical worked example**: `docs/go-language-support-plan.md` — read it
before starting a new language. It has the full phase-by-phase rationale;
this skill is the condensed, reusable version of the same shape.

## When to use

- The user asks to add/plan/scope support for a new language in repo-intel
  (Rust, C++, Python, Java, ...).
- Starting point for a plan-mode session — this skill's workflow maps
  directly onto the phased plan doc this repo's `CLAUDE.md` requires
  (`docs/<language>-language-support-plan.md`, with a `**Status:**` line).

## Before starting: two research spikes, not guesses

1. **Does `@ast-grep/napi`'s built-in `Lang` enum already cover this
   language**, or is a `@ast-grep/lang-<x>` dynamic-grammar npm package
   needed (`registerDynamicLanguage()`, called once at module top-level —
   see `astgrep/langs/go.ts`)? Confirm the package actually exists and
   installs before writing any plan around it — this was an open risk in
   the Go plan doc, resolved only by checking npm directly.
2. **Get the grammar's real field/node-kind names from a live parse, not
   from docs or `node-types.json` alone.** Write a throwaway script that
   parses a real snippet of the target language and inspects the tree
   (`node.kind()`, `node.field(...)`, `node.children()`). This is not
   optional — see "The pointer-type bug" in [examples.md](examples.md) for
   what happens when a field's *position* is assumed instead of checked:
   Go's `pointer_type` node has children `['*', 'type_identifier']` in that
   order, and `children()[0]` silently grabbed the `*` token instead of the
   type for an entire implementation pass before a live-parse check caught
   it. No crash, no type error — just quietly wrong output.

## Workflow — one file per step, in dependency order

1. **Registry entry** — `server/src/modules/repo-intel/languages/index.ts`.
   Add one `{ id, label, extensions }` to `LANGUAGES`. This is the single
   source of truth: `SUPPORTED_EXT`, `SUPPORTED_EXT_SET`, `languageIdForFile`,
   `languagesPresent`, and `labelForLanguageId` all derive from it
   automatically. **Nothing downstream needs a second copy of the extension
   list** — if you find yourself adding a new allowlist anywhere, stop; it
   almost certainly belongs here instead (this is exactly the bug the
   registry itself was created to close — three independently-drifting
   copies before Phase 0 of the Go work).

2. **AST parser module** — new `server/src/adapters/astgrep/langs/<id>.ts`,
   implementing `parseSymbols` / `parseReferences` / `parseInvocationHeads` /
   `parseImports`, built on the language-agnostic helpers in
   `astgrep/shared.ts` (`lineOf`, `endLineOf`, `headSignature`,
   `childrenOfKind`, `getField`, `dedupeSymbols`). **Do not try to fold this
   into one generic node-kind-mapping config shared with `typescript.ts`** —
   see "Design principle: per-language modules" below for why that's a
   trap. Wire it into `astgrep/index.ts`'s dispatcher: one new
   `case '<id>':` line in each of the 4 switch statements, plus one more
   `?? <lang>.langForFile(file)` link in `langForFile`'s chain.

   **Then check every *consumer* of these 4 functions for its own hardcoded
   per-language assumption** — the dispatcher being language-aware does not
   mean everything downstream of it is. `parseInvocationHeads` in
   particular feeds `server/src/modules/repo-intel/service.ts`'s
   `getUnresolvedReferences` (the phantom-API gate), which filters bare
   call heads through `PHANTOM_GLOBALS_BY_LANGUAGE` — **add your language's
   entry to this map** (its builtin functions / predeclared globals /
   builtin-type conversion syntax) or every ordinary use of a builtin will
   be flagged as a phantom API. This bit Go: `len`/`make`/`append` are
   `identifier`-kind bare calls exactly like a real phantom, and nothing
   in Phase 1's per-language astgrep refactor touched this TS-only
   allowlist one layer up — see "The missing phantom-globals entry" in
   [examples.md](examples.md). `pnpm typecheck` will NOT catch this — it's
   a silently-wrong-but-type-safe logic bug, not an import error. Write a
   positive-path test through the real facade method (not just the astgrep
   layer) to catch it instead.

3. **Regex fallback** — new `server/src/adapters/codeindex/extract-<id>.ts`,
   mirroring `extract.ts`'s contract: never throw, degrade to a partial
   result on anything unparseable. This is the always-available path when
   the AST route can't load (a bad prebuild, a napi failure on an unusual
   platform).
   **Known follow-up work triggered by a 3rd language**: `ripgrep.ts`'s
   `symbols()`/`references()` currently dispatch with a plain ternary
   (`languageIdForFile(file) === 'go' ? extractGoSymbols(...) :
   extractSymbols(...)`) — that only works for exactly 2 languages. Adding a
   3rd means refactoring this into a real per-language dispatch (a map from
   language id to `{extractSymbols, extractReferences}`, mirroring
   `astgrep/index.ts`'s switch shape) — budget time for this refactor, it
   is not a 1-line addition once a 3rd language lands.

4. **Import graph** — new `server/src/adapters/depgraph/<id>.ts`
   implementing the `DepGraph` port (`buildEdges(root, files)`), added to
   `UnionDepGraph`'s default builder array in `depgraph/union.ts`. This is
   the most language-specific step — decide up front:
   - Does the language have a manifest that maps a local import path to a
     directory (Go's `go.mod` + package-path prefix; Rust's `Cargo.toml` +
     module path; C/C++ has no equivalent — `#include` resolution depends
     on compiler search paths, not a manifest, so a C/C++ depgraph builder
     may not be worth attempting in v1)?
   - Does the language resolve imports at file granularity or module/package
     granularity? Go resolves at the **package (directory)** level — one
     `import` pulls in every file in the target directory, so `GoDepGraph`
     fans an edge out to every file in that directory rather than picking
     one representative file. Check whether the new language matches this
     shape or is file-granular (closer to TS/JS) before copying the Go
     pattern wholesale.
   - If there's no reliable way to resolve local imports for this language,
     it's fine to skip this step (a builder that always returns `[]`, or no
     builder at all) — `UnionDepGraph` degrades gracefully; PageRank falls
     back to a flat graph. Say so explicitly in the plan doc rather than
     silently shipping no coverage.

5. **Native dependency approval** — if the AST package (or anything else
   just added) has a postinstall/build script, `pnpm add` auto-appends a
   placeholder to `server/pnpm-workspace.yaml`'s `allowBuilds` map;
   `pnpm install`/`pnpm typecheck` hard-fail until it's resolved to
   `true`/`false`. This is not a stray file to exclude from the commit —
   it's meant to be committed.

6. **Find every consumer with `pnpm typecheck`, not grep.** After step 1
   (registry) lands, run `pnpm typecheck` before writing anything else — a
   pre-refactor grep audit during the Go work found 3 of 4 known
   `SUPPORTED_EXT` consumers; the 5th (`depgraph/index.ts`) only surfaced
   as a `tsc` import error once the registry change actually shipped.
   Repeat `pnpm typecheck` after each subsequent step too — it is the
   actual completeness signal here, not a search.
   **Caveat**: `pnpm typecheck` only covers `server/src/**` (per
   `server/tsconfig.json`'s `include`) — it will NOT catch a test fixture
   that constructs a shared interface's shape by hand and is now missing a
   field. Run the full test suite too before calling a phase done.

7. **Prompts — verify, don't edit.** `server/src/modules/reviews/helpers.ts`'s
   `buildStackFraming()` and the seeded reviewer prompts are already
   language-neutral and derive framing from the registry's `label` field at
   review-run time — a new language needs **zero changes here** by
   construction. Just confirm the new `label` from step 1 reads naturally
   in "This diff touches: \<label\>."

8. **`repo_index_state.languages`** — also needs zero changes. It's derived
   from `languageIdForFile` over the walked file set in
   `pipeline/full.ts`/`pipeline/incremental.ts`, so a new registry entry is
   picked up automatically the next time either pipeline runs.

9. **Tests** — mirror the Go coverage shape exactly:
   - `server/test/astgrep-<id>.test.ts` — unit, in-memory source strings,
     covering every symbol kind the language has, at least one reference
     resolution case, at least one import (aliased + plain if the language
     has aliasing).
   - `server/test/extract-<id>.test.ts` — unit, regex-fallback coverage.
   - `server/test/languages.test.ts` — no new file needed; its tests loop
     over `LANGUAGES`, so the registry entry from step 1 is covered
     automatically. Worth a quick read-through to confirm nothing there
     hardcodes the current 2-language count.
   - `server/test/depgraph-<id>.test.ts` — unit, on-disk fixture
     (mkdtemp + writeFile, this repo's established convention over a
     committed `fixtures/` dir) — if step 4 shipped a real builder.
   - `server/test/repo-intel-<id>.it.test.ts` — integration, real Postgres
     (Docker-gated via `dockerAvailable()`), a small real source tree on
     disk with at least 2 local files importing each other (to exercise
     depgraph, not just parsing), asserting on `symbols`/`references`/
     `file_edges`/`repo_index_state.languages` rows after a real
     `runFullIndex` call. This is the one test that proves the whole
     pipeline actually wires together — write it before declaring the
     language "supported," not as an afterthought.
   - **Positive-path test for `getUnresolvedReferences`** (the phantom-API
     gate, `service.ts`) — mirror
     `server/test/repo-intel-phantom-gate.test.ts`'s pattern (hermetic,
     real files on disk, `repo.getRepoBasics` stubbed to skip the DB).
     Assert the new language's builtins are NOT flagged and a genuinely
     undeclared call IS — this is the test category that was missing
     entirely until a post-completion audit of the Go work found it hiding
     a real bug (see [examples.md](examples.md)). Don't skip it a second
     time.

10. **Docs + insights** — save the plan to
    `docs/<language>-language-support-plan.md` per this repo's root
    `CLAUDE.md` "Feature planning" convention (a `**Status:**` line,
    updated as phases complete). After implementation, run the
    `engineering-insights` skill to capture anything genuinely new this
    language surfaced into `server/INSIGHTS.md` — a new language *reusing*
    a pattern this skill already documents is not a new insight; a new
    language *breaking* one of this skill's assumptions (e.g. a
    non-manifest-based import system, a grammar with no `Lang` enum entry
    and no dynamic-grammar package) is exactly the kind of finding that
    should update this skill itself, not just `INSIGHTS.md` — see
    "Keeping this skill current" below.

## Design principle: per-language modules, not one generic config

It's tempting to add a language by growing a single node-kind-mapping
object (`{ functionKind: 'function_declaration', classKind: 'struct_type',
... }`) read by one generic walker. This looks cleaner until the second
language, then breaks: languages differ **structurally**, not just in
kind-name spelling. TS/JS tracks "exported" via an `export` keyword AST
node; Go has no such node at all — exported-ness is a naming convention
(`/^[A-Z]/`) checked in application code, not read off the tree. TS/JS
member access is `member_expression{object,property}`; Go's is
`selector_expression{operand,field}` — different field names a lookup
table can't paper over. A generic config would need to grow into most of a
second interpreter to cover this gap. The actual design: extract only what
*is* genuinely language-agnostic (`astgrep/shared.ts` — tree-walking
utilities that don't reference any kind name) and give each language its
own concrete implementation on top. Expect the same to be true of the next
language — check its structural differences from both TS/JS and Go before
assuming its mapping is "just another entry in a table."

## Keeping this skill current

If implementing a language surfaces a genuinely new, repeatable lesson —
not specific to that one language, but true of *how to add any language*
here — update this file (or [examples.md](examples.md)) in the same PR,
the way the Go implementation's own findings became this skill. A lesson
that's specific to one language's quirks belongs in that language's own
plan doc and `server/INSIGHTS.md`, not here.

See [examples.md](examples.md) for the concrete bugs this process caught
and why, and [template.md](template.md) for a copy-paste starting point for
`docs/<language>-language-support-plan.md`.
