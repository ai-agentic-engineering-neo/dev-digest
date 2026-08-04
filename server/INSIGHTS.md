# INSIGHTS — server

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line, never edit or delete history silently.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule; this file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it. See the repo's `engineering-insights` skill for the full
workflow and quality bar.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-07-27 — `@devdigest/shared` is hand-copied into both `server/src/vendor/shared`
  and `client/src/vendor/shared`, not a real linked package — and the copies
  have already drifted: `AgentManifest`, the `sessionId` field on the
  OpenRouter payload, and the `'openrouter'` provider id exist in the server
  copy but not the client copy. Grep the client copy before assuming a shared
  contract change only needs to happen here.
  (`server/src/vendor/shared/contracts/eval-ci.ts:144-172`,
  `server/src/vendor/shared/adapters.ts:64-69,83` vs the equivalent
  `client/src/vendor/shared/` files, which lack them)

- 2026-08-04 — Growing a shared trace contract (e.g. `RunStats`) means
  updating fixtures in at least 3 separate places, not the 2 you'd find by
  grepping component tests: `server/test/contracts.test.ts` builds its own
  standalone `RunTrace.parse({...})` fixture, independent of
  `RunTraceDrawer.test.tsx`'s. Skipped it once while planning the `cost_usd`
  field and only caught it because the unit suite failed on a Zod
  `invalid_type` error, not from reading the plan.
  (`server/test/contracts.test.ts:160`)

- 2026-08-04 — No SQL `sum()`/`.groupBy()` call exists anywhere in
  `server/src/modules` — the established idiom for a per-PR aggregate (score,
  now cost) is an `IN`-query over the small PR-id list + JS `Map` grouping in
  the route handler itself, not a database-side aggregate. Follow this
  pattern rather than reaching for Drizzle's `sum()` (which also types as
  `string | null` even over a `double precision` column).
  (`server/src/modules/pulls/routes.ts:137-145`, mirroring the pre-existing
  `latestReviewByPr` map at `server/src/modules/pulls/routes.ts:119-128`)

- 2026-08-04 — Extending a shared allowlist constant (`SUPPORTED_EXT` →
  `repo-intel/languages/index.ts`) means auditing every consumer via
  `pnpm typecheck`, not just `grep`. A pre-refactor grep found 3 documented
  consumers + 1 already-known 4th; `depgraph/index.ts` was a genuine 5th
  that only surfaced as a `tsc` import error after the migration. Separately:
  `dependency-cruiser` (used there to build the TS/JS import graph) has no
  concept of Go — once the shared registry started admitting `.go` files,
  this call site needed an explicit `languageIdForFile(f) === 'typescript'`
  filter before `cruise()`, or Go paths would silently flow into a tool that
  can't parse them.
  (`server/src/adapters/depgraph/index.ts:20,55`)

- 2026-08-04 — Adding a second `DepGraph` implementation didn't need a
  registry or a container-level branch: `UnionDepGraph` composes
  `[DepCruiseGraph, GoDepGraph]` behind the same `DepGraph` port and the
  container swaps one `new X()` for `new UnionDepGraph()`
  (`server/src/platform/container.ts:123`) — both existing pipeline call
  sites (`pipeline/full.ts:216`, `pipeline/incremental.ts:219`) already
  passed the full multi-language file list and left filtering to the
  adapter, so nothing upstream had to change. Worth reusing this
  compose-behind-the-port shape for the next per-language port (e.g. a
  future language's own regex fallback or depgraph builder) instead of
  threading a language switch through call sites.
  (`server/src/adapters/depgraph/union.ts`)

- 2026-08-04 — The seeded `PERFORMANCE_REVIEWER_PROMPT`
  (`server/src/db/seed-prompts.ts`) had asserted, as a static fact sent to
  the LLM on every review, "With max ~10 connections this stalls the whole
  service" — DevDigest's own DB pool size, stated as if it were true of
  whatever repo is actually being reviewed. Not a code bug (typechecks,
  runs fine), but a correctness bug in prompt content — worth grepping
  seeded prompt strings for other repo-specific facts (pool sizes,
  concurrency limits, provider names) whenever "review any repo" tooling
  is extended, since nothing catches a wrong assumption baked into prose.
  (`server/src/db/seed-prompts.ts` pre-Phase-4; removed in the same change
  that added per-diff `# Languages in this diff` framing, see
  `server/src/modules/reviews/helpers.ts:buildStackFraming`)

- 2026-08-04 — `pnpm typecheck` only covers `src/**/*.ts` (per
  `server/tsconfig.json`'s `include`) — `server/test/**` is NEVER
  type-checked, only transpiled by vitest's esbuild (which strips types
  without checking them). Adding a required field to a shared interface
  (`IndexState.languages`) silently left 3 test fixtures constructing that
  interface's shape without the new field — `pnpm typecheck` passed clean
  every time; only running the actual test suite (or manually re-reading
  every literal typed as that interface) surfaced them. Don't trust
  `pnpm typecheck` alone as a completeness signal when growing a type that
  test fixtures also construct.
  (`server/tsconfig.json:26` `"include": ["src/**/*.ts"]`)

## Tool & Library Notes

- 2026-08-04 — `server/pnpm-workspace.yaml` is pnpm's own `allowBuilds`
  build-script-approval file, not a stray tooling artifact (previously
  assumed so and excluded from commits — it's real and meant to be
  committed). `pnpm add <pkg-with-a-postinstall>` auto-appends a placeholder
  line here; `pnpm install`/`pnpm typecheck` hard-fail until it's resolved
  to `true`/`false`. This is where to approve a new native/build-script dep.
  (`server/pnpm-workspace.yaml:2`)

## Recurring Errors & Fixes

- 2026-08-04 — `getUnresolvedReferences`'s (`service.ts`) phantom-API gate
  filtered `parseInvocationHeads` output through a single, JS/TS-only
  `PHANTOM_GLOBALS_ALLOWLIST` — a leftover from before Go existed in this
  codebase. Since Phase 1 wired `parseInvocationHeads` for Go too (bare
  calls only, same precision rule as TS/JS), every ordinary Go builtin
  call (`len`, `make`, `append`, `println`, ...) was an `identifier`-kind
  bare call indistinguishable from a real phantom — none were in the
  TS-only list, so every Go file would have them flagged as phantom APIs.
  Found via a post-completion Phase 6 audit, not during implementation —
  `getUnresolvedReferences` had zero positive-path tests for either
  language before this. Fix: split into
  `PHANTOM_GLOBALS_BY_LANGUAGE` (keyed by `languageIdForFile`), added Go's
  predeclared functions + builtin-type conversion names. Generalizable
  lesson (folded into the `add-language-support` skill): a per-language
  dispatcher being correct says nothing about a consumer one layer above
  it that has its own hardcoded single-language assumption — grep every
  consumer of the 4 astgrep functions, not just the dispatcher itself.
  (`server/src/modules/repo-intel/service.ts` —
  `PHANTOM_GLOBALS_BY_LANGUAGE`; test:
  `server/test/repo-intel-phantom-gate.test.ts`)

- 2026-08-04 — tree-sitter-Go's `pointer_type` node (`*Foo`) has TWO
  children in order `['*', 'type_identifier']` — taking `children()[0]` to
  "unwrap the pointer" silently grabs the `*` token, not the type. No
  crash, no type error: a Go method's receiver-type resolution just always
  returned `null`, so the `Receiver.Method` dual-emit convention (mirrored
  from the TS/JS class-method pattern) quietly degraded to bare-name-only
  until checked against a real parse, not just the grammar's field list.
  Fix: filter children by `kind() === 'type_identifier'`, never assume
  position. (`server/src/adapters/astgrep/langs/go.ts:67-72`)

- 2026-08-04 — A literal NUL byte (0x00) was found embedded mid-template-
  literal in `depgraph/index.ts` (sitting where a space should be, between
  two `${}` interpolations) — pre-existing, unrelated to any session's
  edits. It silently broke exact-string-match `Edit` calls against that
  line (the text looked like a normal space in `Read` output). Diagnosed
  with `sed -n '<n>p' file | od -c` after repeated no-visible-cause
  replace failures; fixed by rewriting the file's bytes directly (Python,
  `bytes.replace(b'\x00', b' ')`) rather than another string-based edit.
  Worth trying `od -c` early if an `Edit` inexplicably can't find text that
  `Read` clearly shows.

## Open Questions

- 2026-07-27 — No sync/codegen step keeps `src/vendor/shared` in step with
  the client's copy — is a checked-in diff script or a build-time copy step
  worth adding, or does the course intentionally keep this manual?

## Session Notes

- 2026-08-04 — `engineering-insights` did not auto-invoke during the whole
  `feat/review-cost` session (a multi-file feature with real findings — see
  above) despite matching its own "end of a non-trivial coding session"
  trigger in its `SKILL.md` description. It only ran because the user
  explicitly asked whether it had fired. Confirms the skill's own
  "Course arc" note in `references.md`: a description/manual trigger alone
  is not reliable enough without a `Stop` hook forcing it.

- 2026-08-04 — Go language support (Phase 0+1+2 of
  `docs/go-language-support-plan.md`) landed on `docs/go-language-support-plan`
  (PR #3, fork). Verified end-to-end against real Go source (not just unit
  fixtures) before writing formal tests — caught the pointer-receiver bug
  above that way. Phase 3 (import graph without `dependency-cruiser`),
  Phase 4 (de-hardcode system prompts), Phase 5 (`languages[]` DB column)
  remain deferred.

- 2026-08-04 — Phase 3 (Go import graph) also landed same branch/PR:
  `GoDepGraph` resolves local imports via `go.mod`'s `module` directive +
  the Phase 1 `parseImports` output, fanning an edge out to every file in
  the imported package's directory (Go resolves at package granularity,
  not file granularity — picking a single representative file would have
  undercounted a package's PageRank fan-in). Phase 4/5 still deferred.

- 2026-08-04 — Phase 4 (de-hardcode system prompts) also landed same
  branch/PR: rewrote `GENERAL_REVIEWER_PROMPT`/`PERFORMANCE_REVIEWER_PROMPT`
  neutral (matching `SECURITY_REVIEWER_PROMPT`'s existing style) and added
  `buildStackFraming()` to inject per-diff language framing at review-run
  time instead — kept out of `reviewer-core` entirely (it has no
  `language` concept anywhere in its types) by folding the framing into
  the plain `systemPrompt` string server-side, before the
  `reviewPullRequest()` call. Phase 5 (`languages[]` DB column) is the
  only phase still deferred.

- 2026-08-04 — Phase 5 (repo language detection) also landed same
  branch/PR, closing out all 6 phases of `docs/go-language-support-plan.md`.
  `repo_index_state.languages` is derived from the actually-walked/indexed
  file set (`languagesPresent()` over `walk.files`/`allFiles`) rather than
  `go.mod`/`package.json` marker files as the plan originally sketched —
  more accurate for "what did we actually index" and free (both pipelines
  already compute that file list for other T3 steps). No downstream
  consumer reads this column yet — confirmed via a repo-wide grep before
  implementing, so it's genuinely informational/future-use, not dead code
  masquerading as used.

- 2026-08-04 — User asked to double-check Phase 6 after all 6 phases were
  marked done. Re-reading the phase's literal scope against what was
  actually tested (not just re-reading the "done" summary) surfaced a real
  bug — the phantom-globals allowlist gap above — that every phase's own
  "Tests:" note had missed, because `parseInvocationHeads` was implemented
  and dispatcher-wired in Phase 1 but its only real consumer
  (`getUnresolvedReferences`) was never exercised end-to-end for either
  language. Distilled into the `add-language-support` skill (new example
  + a workflow step) so the next language checks this before declaring
  Phase 6 complete, not after. Also created the skill itself this session
  (`.claude/skills/add-language-support/`), the first non-course-provided
  project skill authored from this repo's own findings.
