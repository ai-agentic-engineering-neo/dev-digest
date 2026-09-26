# Smart Order / Smart Diff (server)

**Status:** in-progress
**Lesson / ticket:** L03

## Goal

On the PR "Files changed" tab the user sees the PR's files grouped by role
(core → tests → wiring → docs → boilerplate) instead of GitHub's raw file
order, so the reviewer's attention goes to the files that matter first. The
server exposes a deterministic classification of each file plus a
"is this PR too big to review at once" signal; no LLM call is involved and
the feature has zero marginal cost.

## Non-goals

- LLM summaries, `pseudocode_summary` and `proposed_splits` content, or any
  change to the prompt builder / `reviewer-core`. `pseudocode_summary` is
  always `null` and `proposed_splits` is always `[]` in this iteration.
- DB schema and migrations — no new table or column. `pr_files`, `reviews`
  and `findings` already carry everything the classifier needs.
- Sorting files *within* a role group by `repo-intel`'s `file_rank` — rejected
  because `getFileRank` returns `[]` whenever repo-intel is disabled or the
  repo isn't indexed, which would make in-group order machine-dependent.
  Within a group, files keep GitHub's original order (client) / are sorted by
  path (server's own listing, for a deterministic response).
- Changes to the Findings tab (still shows every run).
- Findings whose `file` is not among the PR's files — not shown on this tab.

## Contract

**Shared contract** (`server/src/vendor/shared/contracts/brief.ts`, mirrored
byte-for-byte in `client/src/vendor/shared/contracts/brief.ts`):

- `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`
  — was `['core', 'wiring', 'boilerplate']`; `tests` and `docs` are new
  values, order matches on-screen display order. Purely additive (no
  breaking change to existing consumers).
- `SmartDiff`, `SmartDiffGroup`, `SmartDiffFile`, `ProposedSplit` — unchanged
  (`contracts/brief.ts:135-164`).
- `SmartDiffResponse = SmartDiff` (`contracts/review-api.ts:95-97`) —
  unchanged.

**Route** (new module `server/src/modules/smart-diff/`, registered in
`server/src/modules/index.ts` under the key `smartDiff`):

- `GET /pulls/:id/smart-diff` → 200 `SmartDiffResponse`.
  - 404 `NotFoundError('Pull request not found')` if the PR doesn't exist or
    belongs to another workspace.
  - 422 for a non-uuid `:id` (`IdParams`).
  - A PR with no `pr_files` rows → 200 `{ groups: [], split_suggestion: {
    total_lines: 0, too_big: false, proposed_splits: [] } }`.
  - Global rate limit only (120/min) — this is a read with no LLM cost.

Ring layout (`onion-architecture`): `routes.ts` (④, delegates only),
`service.ts` (②, `SmartDiffService.get(workspaceId, prId, logger?)`, reads
via `container.reviewRepo` — `getPull`, `getPrFiles`, `reviewsForPull`; no
own `repository.ts`, per the "do not create empty files" rule), `helpers.ts`
(②, pure), `constants.ts` (literals). No new port: nothing outside the
process is called.

### Classifier

`classifyPath(path)`: `segments = path.split('/')`, `base` = last segment,
`dirs` = the rest. Comparison is case-sensitive. "Segment" means an exact
match against one of `dirs` — never a substring, never the basename. Rules
are checked in this order (first match wins); anything unmatched is `core`:

| Role | Pattern | Rule | Anchoring |
|---|---|---|---|
| boilerplate | `*.lock` | base ends with `.lock` | basename, any depth |
| | `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` | base equals | basename |
| | `dist/**`, `build/**` | segment `dist` or `build` | any depth |
| | `**/__snapshots__/**` | segment `__snapshots__` | any depth |
| | `*.snap`, `*.min.js` | base ends with `.snap` / `.min.js` | basename |
| | `*.generated.*` | base matches `/^.+\.generated\..+$/` | basename |
| tests | `*.test.ts(x)`, `*.it.test.ts`, `*.spec.ts` | base ends with `.test.ts` / `.test.tsx` / `.spec.ts` | basename |
| | `**/test/**`, `**/tests/**`, `**/__tests__/**` | segment | any depth |
| | `e2e/**` | segment `e2e` | any depth |
| wiring | `index.ts`, `index.js` | base equals | basename |
| | `*.config.*` | base matches `/^.+\.config\..+$/` (`config.ts` itself does NOT match — no dot before `config`) | basename |
| | `tsconfig*.json` | base starts with `tsconfig`, ends with `.json` | basename |
| | `.eslintrc*`, `.env*` | base starts with `.eslintrc` / `.env` | basename |
| | `docker-compose*.yml` | base starts with `docker-compose`, ends with `.yml` | basename |
| | `.github/**`, `.claude/**` | segment | any depth |
| docs | `**/*.md` | base ends with `.md` | basename |
| | `docs/**` | segment `docs` | any depth |
| | `README*`, `CHANGELOG*` | base starts with | basename |
| | `LICENSE` | base equals | basename |
| core | everything else | — | — |

`Cargo.lock` / `poetry.lock` are already covered by the generic `*.lock`
rule and are not listed separately. Any-depth segment matching is a
deliberate monorepo choice: it also catches `build/` used as a source
directory name and `server/docs/*.ts`. No additional boilerplate patterns
(`go.sum`, `*.min.css`, `*.map`) are added in this iteration, and `**/vendor/**`
is deliberately rejected — it would hide changes to
`*/src/vendor/shared/contracts/*` inside the boilerplate group.

### "Latest review per agent"

Identical rule on server and client (client copy: `DiffTab/helpers.ts`,
its own spec):

1. Group reviews by `agent_id`; every review with `agent_id = null` is one
   single group (not one group per row — the seed has exactly one
   `agent_id = NULL` review).
2. Within a group, keep the review with the greatest `created_at`; on a tie,
   the greatest `id`.
3. Only findings from the kept reviews count.

A failed re-run of an agent creates no review row (`ReviewRecord` only ever
represents a persisted, successful review), so the previous successful run's
findings/markers remain visible until a new one supersedes them.

### `finding_lines` / dismissed / accepted

- `finding_lines` on a `SmartDiffFile` = sorted, de-duplicated `start_line`s
  of **non-dismissed** findings from the kept reviews whose `file === path`.
  Accepted findings still count (accept confirms a true positive, it doesn't
  hide it); dismissed findings never contribute a line.
- The server computes `finding_lines` so the contract's field is truthful,
  but the client's finding markers (dots, chips, inline cards) are sourced
  **only** from `usePrReviews` — never from this field — so there is exactly
  one source of truth for what the user sees, and it updates immediately on
  accept/dismiss. Both implementations follow the same rule above; parity is
  pinned by a shared fixture used in both the server's and the client's unit
  tests (Test brief TP-1).

### `split_suggestion`

- `total_lines = Σ(additions + deletions)` over all of the PR's files.
- `too_big = total_lines >= 400` (matches the existing "L" size badge on the
  PR list, `client/.../pulls/helpers.ts`, `SIZE_MEDIUM_MAX = 400`).
- `proposed_splits` is always `[]` in this iteration (no LLM-derived split
  suggestions yet).
- Every file's `pseudocode_summary` is `null`.

### Response shape

`groups` contains only non-empty groups, in the fixed order core → tests →
wiring → docs → boilerplate. Within a group the server sorts files by `path`
(code-unit order) so its own response is deterministic; the client lays
files out in the PR's original GitHub order instead (see the client spec).

### Logging

One `logger?.info({ prId, files, byRole: {core,tests,wiring,docs,boilerplate},
findings, reviewsKept, totalLines, tooBig, durationMs }, 'smart-diff: built')`
per call, using `req.log` (type `PinoLike`,
`server/src/platform/run-logger.ts`). No file path, patch text or finding
text is ever logged.

## Acceptance criteria

- [ ] `GET /pulls/:id/smart-diff` for a PR with files `src/a.ts`,
      `src/a.test.ts`, `tsconfig.json`, `README.md`, `pnpm-lock.yaml` returns
      200 and `groups[].role` in the order
      `["core","tests","wiring","docs","boilerplate"]`.
- [ ] A PR from another workspace, or a random (non-existent) uuid → 404;
      `/pulls/not-a-uuid/smart-diff` → 422.
- [ ] `split_suggestion`: 399 total lines → `too_big: false`; 400 →
      `too_big: true`; `proposed_splits` is always `[]`; every
      `pseudocode_summary` is `null`.
- [ ] `finding_lines` only reflects the latest review per agent, and never
      includes a dismissed finding's line.
- [ ] `server/src/vendor/shared/contracts/brief.ts` and the client's copy are
      byte-identical; `SmartDiffRole.options` is
      `['core','tests','wiring','docs','boilerplate']`.
- [ ] `git diff main --stat -- reviewer-core server/src/db client/src/vendor/ui
      '**/package.json' '**/*lock*'` is empty.

See the client spec ([../../client/specs/L03-smart-diff.md](../../client/specs/L03-smart-diff.md))
for the UI-facing acceptance criteria (order toggle, group headers, finding
markers, inline cards, unanchored block).

## Test plan

This iteration ships the implementation only; test files are written by
test-writer from this spec and the plan's per-work-package "Tests" lines.

| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| server | `pnpm typecheck` | no | contract, module |
| server | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | no | `classifyPath`, `latestReviewPerAgent`, `buildSmartDiff`, contract enum |
| server | `../scripts/hermetic.sh pnpm exec vitest run .it.test` | yes | route, 404/422, logging (no secret leakage) |
| client | `pnpm typecheck` · `pnpm test` | no | helpers, DiffTab, diff-viewer, hooks |
