# Smart Diff

**Status:** v1. Curriculum slot: L03 (`README.md:84` — "L03 | Intent layer ·
Smart Diff"; this spec covers Smart Diff only, Intent layer is
[05-intent-layer.md](05-intent-layer.md)).

## Context

A PR's "Files changed" list today (`DiffTab` → `DiffViewer`) is a flat,
GitHub-order list of `PrFile`s — a one-line `package-lock.json` diff sits
next to a security-relevant middleware change with no visual distinction.
Smart Diff groups files by risk — **core** (business logic), **wiring**
(config/bootstrap/index files), **boilerplate** (lock files, build output,
snapshots) — so a reviewer's attention goes to core logic first and generated/
mechanical files stay out of the way, collapsed.

This is not a new LLM feature. It's a deterministic reorganization of data
the app already has:

- `GET /pulls/:id` already returns every changed file (`path`, `additions`,
  `deletions`, `patch`) — enough to classify a file by its path alone.
- `GET /pulls/:id/reviews` already returns the latest review's findings
  (`file`, `start_line`, `end_line`, `severity`) — enough to badge a file
  with "N findings" and know which lines to jump to.
- `SmartDiff`/`SmartDiffRole`/`SmartDiffFile`/`SmartDiffGroup` already exist,
  fully defined, in both `vendor/shared/contracts/brief.ts` copies (server
  and client, byte-identical) — reserved but never implemented. This spec is
  what fills that reservation in.

## Scope

**In:**

1. A pure path/pattern classifier, `classifyFile(path): SmartDiffRole`, and
   an assembler, `buildSmartDiff(files, findings): SmartDiff`, in
   `server/src/modules/reviews/smart-diff.ts`. Patterns and thresholds live
   in a sibling constants file, `smart-diff-constants.ts` — see
   [Classifier rules](#classifier-rules).
2. `GET /pulls/:id/smart-diff` on the existing `reviews` module (alongside
   `/pulls/:id/reviews`, which already owns the read side of this domain).
   Reuses `ReviewRepository.getPull`/`getPrFiles`/`reviewsForPull` — no new
   repository method.
3. Client: a `useSmartDiff(prId)` hook, and a `SmartDiffViewer` component
   (sibling to `DiffTab` under the PR page's `_components/`) that groups
   files by role, keeps boilerplate files collapsed by default, shows a
   findings-count badge per file, and scrolls to the relevant line on click.
   A "Smart order" / "Original order" toggle on the Files changed tab
   switches between it and the existing flat `DiffViewer`.

**Out of scope (explicitly):**

- Any new LLM call. `pseudocode_summary` (the contract's optional
  "What this does" field) stays `null` in this pass — a future lesson may
  populate it; `assemblePrompt`/agents are untouched.
- Persisting the computed `SmartDiff` anywhere. `pr_brief` (the table that
  would naturally hold a cached composite) is reserved for a later "PR Brief
  card" lesson (`server/LEARNINGS.md`'s 2026-08-03/08-04 entries document
  this reservation) — writing into it here would collide with that future
  feature. Classification is cheap and recomputed per request instead.
- A UI for `split_suggestion` (part of the `SmartDiff` contract, computed
  for contract completeness — see [Split suggestion](#split-suggestion) —
  but not rendered anywhere in this pass).
- Fixing `pulls/routes.ts`'s existing onion-architecture violation (direct
  Drizzle access, no service/repository layer) — unrelated to this feature,
  which lives in the already-layered `reviews` module instead.
- Diff-content-aware classification (e.g. "this CRUD handler is mechanical
  enough to be boilerplate"). Classification is path/pattern-only, per the
  original feature ask — no diff parsing beyond the additions/deletions
  counts already on `PrFile`.

## Modules affected

**server**: `modules/reviews/smart-diff.ts` (new), `modules/reviews/
smart-diff-constants.ts` (new), `modules/reviews/smart-diff.test.ts` (new),
`modules/reviews/service.ts` (new method), `modules/reviews/routes.ts` (new
route). No schema/migration changes, no contract changes (the `SmartDiff`
contract already matches this spec exactly).

**client**: `lib/hooks/reviews.ts` (new hook), `components/diff-viewer/
CodeLine/CodeLine.tsx` and `.../FileCard/FileCard.tsx` (small additive props
for scroll-to-line and forced collapse — both optional, existing callers
unaffected), a new `_components/SmartDiffViewer/` folder under the PR
detail route, `_components/DiffTab/DiffTab.tsx` (wires the toggle),
`messages/en/shell.json` (new i18n keys).

## Architectural constraints

- `reviewer-core/CLAUDE.md`: "Pure engine: no DB, GitHub, or filesystem
  access… the only side effect allowed is an LLM call." Since Smart Diff
  makes no LLM call and needs no reviewer-core involvement at all, the
  classifier lives in `server/src/modules/reviews/`, not `reviewer-core` —
  mirroring `pulls/status.ts`'s existing "pure helpers, no DB/`this`" shape.
- `server/CLAUDE.md` / `onion-architecture`: routes are adapters (parse →
  call one service method → return); the route must not touch Drizzle
  directly. `smart-diff.ts`'s functions are pure (files/findings in,
  `SmartDiff` out) — all I/O stays in `ReviewService.smartDiff`, which
  composes existing `ReviewRepository` reads.
- Root `CLAUDE.md` Do-not-touch: `server/src/vendor/shared` and
  `client/src/vendor/shared` are independent, unsynced copies. Not relevant
  here in practice — `SmartDiff` already matches on both sides (confirmed
  byte-identical `brief.ts`/`review-api.ts` diff), so no contract edits are
  needed on either side for this feature.

## Approach

### Classifier rules

Checked in order, most-specific-first — `boilerplate` before `wiring` before
the `core` fallback:

| Role | Matches |
|---|---|
| `boilerplate` | Lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `go.sum`), `package.json`, build/output dirs (`dist/`, `build/`, `out/`, `coverage/`, `.next/`), snapshot files (`__snapshots__/`, `*.snap`), minified/sourcemap files (`*.min.js`, `*.min.css`, `*.map`) |
| `wiring` | Basename matches a bootstrap/config/index name (`index.*`, `server.*`, `config.*`, `container.*`, `app.*`, `bootstrap.*`, `main.*`, `setup.*`), or path matches a config-file convention (`*.config.*`, `tsconfig*.json`, `.github/workflows/**`, `docker-compose*.yml`, `Dockerfile*`, `.env*`) |
| `core` | Everything else — the default |

All patterns and the split-suggestion threshold live in
`smart-diff-constants.ts` so tuning them never touches the classification
logic itself.

### API

`GET /pulls/:id/smart-diff` → `SmartDiff` (the existing contract, unchanged):

```ts
{
  groups: [{ role: 'core' | 'wiring' | 'boilerplate', files: SmartDiffFile[] }],
  split_suggestion: { too_big: boolean, total_lines: number, proposed_splits: [...] },
}
```

Empty groups are omitted; the array is always given in `core, wiring,
boilerplate` order. Each `SmartDiffFile.finding_lines` is the union of
`start_line..end_line` from the latest review's findings for that file
(newest review = `reviewsForPull(prId)[0]`, since that repo method already
orders newest-first); `pseudocode_summary` is always `null` (see
[Scope](#scope)).

#### Split suggestion

`split_suggestion.total_lines` sums `additions+deletions` across every file;
`too_big` is true above `SPLIT_SUGGESTION_LINE_THRESHOLD` (400). When
`too_big`, `proposed_splits` groups `core`-role files by top-level directory
(one proposed split per distinct directory) — a simple, honest, deterministic
computation for contract completeness. No client UI reads this field yet.

### UI

`DiffTab` gains a two-state toggle ("Smart order" — default — / "Original
order"). Smart order renders the new `SmartDiffViewer`: one section per
non-empty role group (colored dot + label + file count), each file reusing
the existing `FileCard`/`CodeLine` diff renderer (so patch parsing, and
existing inline PR commenting, are unchanged) joined against the already-
fetched `PrFile[]` by path. Boilerplate files default closed regardless of
size. A file with `finding_lines.length > 0` shows an "N findings" badge;
clicking it opens that file (if closed) and smooth-scrolls to the first
finding line, via an anchor id (`diffline-{path}-{line}`) added to each
rendered diff line.

## Verification

- `pnpm test`/`pnpm typecheck` in `server` (new `smart-diff.test.ts`) and
  `client` (new `SmartDiffViewer.test.tsx`); `pnpm arch` stays green in
  `server` (no new cross-module import).
- Manual, via `./scripts/dev.sh`: open a large PR's Files changed tab — core
  logic first, a lock file collapsed under Boilerplate. Run a review, reopen
  the tab — findings badges appear, clicking one scrolls to the line. Toggle
  Original order — the prior flat view (incl. inline commenting) still
  works. Confirm via server logs that `GET /pulls/:id/smart-diff` makes no
  LLM/provider call.
