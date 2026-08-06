# Blast Radius

**Status:** v1 draft, not yet implemented. Curriculum slot: L04.

## Context

A PR review shows the diff and findings, but not the reviewer's next question:
"what else could this change affect?" `repo-intel` (`server/src/modules/repo-intel/`)
already indexes every repo on clone/refresh into Postgres — `symbols`, `references`,
`file_edges`, `file_rank`, `file_facts` — behind a single facade, `RepoIntel`, that every
feature is meant to read through rather than touching AST/graph libraries directly.

`RepoIntel.getBlastRadius(repoId, changedFiles)` already exists and computes most of what
Blast Radius needs — symbols declared in changed files, their resolved cross-file callers
(with file-rank), and per-file HTTP-endpoint facts — entirely by reading the persistent
index (`tryPersistentBlast`, `repo-intel/service.ts:315-391`), no AST reparsing on the
request path. It falls back to a ripgrep/clone-parsing "degraded" path only when the
persistent index is absent (already tagged `degraded: true, reason: 'no_data'`).

Three gaps exist in that computation against this feature's requirements (verified by
reading `repo-intel/service.ts:220-391` and `repository.ts:502-531`):

1. **Caller cap is global, not per-symbol.** `MAX_CALLERS_PER_SYMBOL = 20`
   (`constants.ts:30`) is applied once to the whole flattened, rank-sorted caller list
   (`callers.sort(...); callers.slice(0, MAX_CALLERS_PER_SYMBOL)`, `service.ts:372-373`) —
   one hot symbol can starve every other changed symbol of caller slots.
2. **No declaring-file exclusion in the persistent path.** The degraded/ripgrep fallback
   explicitly skips `r.fromPath === sym.file` (`service.ts:273`), but `getResolvedCallers`
   (`repository.ts:502-531`) has no equivalent filter — a same-file reference to the symbol
   wrongly counts as a "caller."
3. **Endpoint/cron impact is 1-hop (direct symbol-callers only), not the 2-hop reverse
   import-graph walk this feature needs.** `getCriticalPaths` (`service.ts:663-702`) is
   architecturally close (`file_edges` + `BFS_DEPTH=2`) but walks the *forward* direction as
   a single greedy best-rank chain per root — not reusable as-is; blast needs the *reverse*
   adjacency (`toFile → fromFile[]`) and the *full BFS frontier set*, not one greedy chain.

Fixing these lives inside `repo-intel`, not worked around in the new `blast/` module — all
the facts already live in the index; the feature only reads it and shapes a representation.

There's also an already-defined but unused shared Zod contract,
`server/src/vendor/shared/contracts/brief.ts` (byte-identical copy in
`client/src/vendor/shared/contracts/brief.ts`) — `ChangedSymbol` / `BlastCaller` /
`DownstreamImpact` / `BlastRadius` — reserved for a not-yet-built "PR Brief" feature. Per
the Smart Diff precedent ([06-smart-diff.md](06-smart-diff.md); `server/LEARNINGS.md`
2026-08-04 addenda: a feature named in `brief.ts` can ship standalone, fully compute-on-read,
without touching `pr_brief`), this spec reuses `BlastRadius` as the route's response
*domain* shape rather than inventing a third one.

`mcp-server`'s `get_blast_radius` tool is currently an intentional stub — zero backend
calls — specifically because no HTTP route exposes `RepoIntel.getBlastRadius` yet.
`mcp-server/CLAUDE.md` and [06-mcp-server.md §3.5](06-mcp-server.md) both flag it as
blocked on exactly this work.

## Scope

**In:**

1. Three fixes inside `repo-intel/service.ts` + `repository.ts`: per-symbol caller cap,
   declaring-file exclusion, 2-hop reverse-import-graph endpoint/cron impact.
2. A new server module `blast/` (`service.ts`, `routes.ts`) exposing
   `GET /pulls/:id/blast` — thin read: PR → changed files → `repoIntel.getBlastRadius` +
   `repoIntel.getIndexState` → shape into the `BlastRadius` contract plus a status envelope.
   No LLM call, no new repository method beyond what `repo-intel` already owns.
3. Two small additive fields on the existing `BlastRadius`/`BlastCaller` contracts (both
   `vendor/shared` copies) — see [API](#api).
4. A "Blast Radius" tab on the PR detail page: changed symbols → their callers → impacted
   endpoints, with `file:line` links that open the exact line on GitHub, and a distinct
   non-blocking banner for `partial`/`degraded` index states.
5. A real `get_blast_radius` implementation in `mcp-server`, replacing the stub, calling the
   new route via `resolveRepo`/`resolvePull` the same way `get_findings` does.

**Out of scope (explicitly):**

- The optional one-LLM-call summary paragraph mentioned in the original feature ask.
  Deferred — the shipped path is 100% deterministic, index-read only, zero LLM calls. No
  `FeatureModelId` addition, no `?summarize=` param in this pass.
- Persisting the computed `BlastRadius` anywhere. `pr_brief` is reserved for a later "PR
  Brief card" lesson (same reservation Smart Diff already respects) — recomputed per
  request instead.
- Any change to `RepoIntel`'s public interface (`repo-intel/types.ts`) — the reverse-BFS
  fix stays a private implementation detail of `tryPersistentBlast`.
- Fixing unrelated onion-architecture debt elsewhere in the codebase.

## Modules affected

**server**: `modules/repo-intel/repository.ts` (edit — `getResolvedCallers` exclusion
filter), `modules/repo-intel/service.ts` (edit — per-symbol cap, `reverseImportImpact`
helper), `test/repo-intel-blast-persistent.it.test.ts` (new), `vendor/shared/contracts/
brief.ts` (edit — additive fields), `modules/blast/service.ts` (new), `modules/blast/
routes.ts` (new), `modules/blast/service.test.ts` (new), `modules/index.ts` (new
registration).

**client**: `src/vendor/shared/contracts/brief.ts` (edit, mirrors server), `lib/hooks/
blast-radius.ts` (new), `_components/BlastRadiusTab/{BlastRadiusTab.tsx,styles.ts,
index.ts,BlastRadiusTab.test.tsx}` (new folder, mirrors `DiffTab`), `_components/
PrDetailHeader/PrDetailHeader.tsx` (edit — new tab entry), `_components/PrDetailView/
PrDetailView.tsx` (edit — tab wiring).

**mcp-server**: `src/tools/get-blast-radius.ts` (edit — replace stub body + description),
`src/tools/index.ts` (edit — handler signature), `test/tools/get-blast-radius.test.ts`
(full rewrite — inverts the "fetch never called" assertion), `CLAUDE.md` (edit — remove
`get_blast_radius` from Do-not-touch), `specs/06-mcp-server.md §3.5` (minimal factual
update — "no HTTP endpoint exists" becomes false).

## Architectural constraints

- `onion-architecture` / `server/CLAUDE.md`: routes are adapters (parse → call one service
  method → return); `blast/routes.ts` must not touch Drizzle directly. All I/O stays behind
  `BlastService`, which composes `container.reviewRepo` + `container.repoIntel`.
- Cross-module rule (dependency-cruiser `no-cross-module`, `server/LEARNINGS.md`
  2026-08-03/08-06): `blast/service.ts` must not import `ReviewRepository`'s concrete class
  — declare a narrow local port (`PrFileLookup`, mirrors `reviews/service.ts`'s
  `AgentLookup` pattern), satisfied structurally by `container.reviewRepo`, wired in at
  `blast/routes.ts` (the one ring allowed to know concrete classes). `RepoIntel` itself is
  already the cross-module-safe facade interface, so `blast/service.ts` may import it
  directly from `repo-intel/types.ts`.
- Root `CLAUDE.md` Do-not-touch: `server/src/vendor/shared` and `client/src/vendor/shared`
  are independent, unsynced copies — the `BlastCaller`/`BlastRadius` edits must be applied
  to both, by hand.
- `mcp-server/CLAUDE.md`: no `@devdigest/shared` alias there — the real `get_blast_radius`
  defines its own local `Raw...` interfaces mirroring the new route's response, same as
  every other tool in that package. Tool descriptions and `tools/index.ts` registration
  order must stay byte-identical/stable except for this one deliberate, reviewed edit.

## Approach

### repo-intel fixes

- `repository.ts` — `getResolvedCallers`: join `symbols` on
  `(repoId, name = toSymbol, path IN declFiles)` and add `fromPath != symbols.path` to the
  WHERE, excluding a caller specifically from *the* symbol's own declaring file (not just
  "any changed file").
- `service.ts` (`tryPersistentBlast`) — group `callers` by `viaSymbol`, sort each group by
  `rank DESC`, slice `MAX_CALLERS_PER_SYMBOL` (20) per group, flatten back.
- `service.ts` — add `reverseImportImpact(repoId, changedFiles): Promise<Set<string>>`:
  build a `toFile → fromFile[]` adjacency from `repo.getEdges(repoId)` (inverse of
  `getCriticalPaths`'s direction), BFS the full frontier `BFS_DEPTH` (2) hops from each
  changed file, union the reachable file set. Union that set with the direct caller-files
  before calling `repo.getFileFacts(...)`, so `impactedEndpoints`/`factsByFile` cover both
  direct symbol-callers and the 2-hop reverse-import set. No change to the public
  `RepoIntel` interface or `BlastResult` shape.

### API

`GET /pulls/:id/blast` →

```ts
{
  status: IndexStatus;              // 'full' | 'partial' | 'degraded' | 'failed'
  degradedReason?: DegradedReason;  // from repoIntel.getIndexState / getBlastRadius
  data: BlastRadius;                // the existing vendor/shared contract
}
```

`BlastRadius` (`vendor/shared/contracts/brief.ts`) gains two additive fields:

- `BlastCaller.rank: z.number().int()` — needed to show/sort caller importance;
  `rank: 0` is the existing signal for "no rank data" (degraded path).
- `BlastRadius.summary: z.string().nullish()` — was required `z.string()`; must be
  legitimately absent since the main path never calls the LLM.

Partial/degraded status stays **out of** `BlastRadius` itself — it's a transport concern of
this one endpoint, not a property the future PR Brief composition should carry — hence the
separate envelope fields, matching `repo-intel`'s own "DEGRADED CONTRACT" convention
(`repo-intel/types.ts:15-23`: inline `degraded?`/`reason?` on object-returning methods)
applied one level up, at the HTTP boundary.

`BlastService.getBlast(workspaceId, prId)`: `getPull` → 404 if missing → `getPrFiles` → map
to paths → `repoIntel.getBlastRadius(repo.repoId, paths)` + `repoIntel.getIndexState(repo.repoId)`
→ pure mapper grouping the flat `callers[]` into `downstream[]` by `viaSymbol`, attaching
`endpoints_affected`/`crons_affected` from `factsByFile`.

### UI

New `BlastRadiusTab` (mirrors `DiffTab`'s folder shape), added to `PrDetailHeader`'s `tabs`
array and `PrDetailView`'s tab body, receiving `prId`/`repoFullName`/`headSha` the same way
`FindingCard`/`DiffTab` already do. Renders:

- `status === 'partial' | 'degraded'` → a non-blocking banner above the results with
  distinct copy per state (both still carry real, if incomplete, data — masking
  present-but-incomplete data behind a blocking screen violates the same "don't mask
  missing data" principle that governs the true-empty case).
- `data.changed_symbols.length === 0` (and no index ever ran) → the standard `EmptyState`
  from `@devdigest/ui`.
- Otherwise: a list grouped by `data.downstream[]`; each caller's `file:line` renders via
  `MonoLink` + `githubBlobUrl(repoFullName, headSha, caller.file, caller.line, caller.line)`
  (`client/src/lib/github-urls.ts`) — the exact pattern `FindingCard.tsx:61-85` already
  uses, opening GitHub in a new tab. No in-app scroll target, so the existing
  target+nonce navigation pattern (`client/LEARNINGS.md` 2026-08-04/08-06) is intentionally
  not copied a 4th time here.

### mcp-server

`get-blast-radius.ts`: replace the stub body with the `get-findings.ts` pattern —
`resolveRepo` → `resolvePull` (handle `PullNotFoundError` the same way) →
`http.get<RawBlastRadiusResponse>('/pulls/${pull.id}/blast')` → map to a concise result
(`status`, `degraded_reason`, `changed_symbols`, `downstream: [{symbol, callers: [{file,
line, rank}], endpoints_affected, crons_affected}]`). Local `Raw...` interfaces only.
Rewrite `GET_BLAST_RADIUS_DESCRIPTION` as a new VERBATIM-marked real description (tone
matches `GET_FINDINGS_DESCRIPTION`). `tools/index.ts` swaps
`makeGetBlastRadiusHandler()` for `makeGetBlastRadiusHandler(http, apiBaseUrl)`, same
position/order.

## Verification

- `cd server && pnpm typecheck && pnpm test` (includes the new `.it.test.ts` — Docker-gated,
  self-skips otherwise) and a dependency-cruiser check for the new `blast/` module (no
  cross-module violations).
- `cd client && pnpm typecheck && pnpm test`.
- `cd mcp-server && pnpm typecheck && pnpm test`.
- Boot the real stack (`./scripts/dev.sh`), open a demo PR that touches a shared helper
  function, open the new **Blast Radius** tab: confirm ≥2 real callers and ≥1 HTTP endpoint
  are shown; click a `file:line` link and confirm it opens the right GitHub line.
- Run a scenario against a repo with a partial/degraded index and confirm the distinct
  banner (not a blank list); run a scenario where a changed file has no callers and confirm
  the clear empty state (not a silently-empty array indistinguishable from "not checked
  yet").
- `GET /pulls/:id/blast` via curl while tailing server logs — confirm only SELECT-shaped
  index reads happen, no clone/AST parsing (unless the index is genuinely absent, the one
  documented degraded-fallback exception).
- Call `get_blast_radius` via MCP Inspector (and/or Claude Code) for the same PR, compare
  its response against the UI tab.
