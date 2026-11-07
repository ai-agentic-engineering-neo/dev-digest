# Smart Diff — server (+ shared contracts)

Client half: [../../client/specs/smart-diff.md](../../client/specs/smart-diff.md).

## Goal

`GET /pulls/:id/smart-diff` returns the PR's changed files in **all five role groups**
(core → tests → wiring → docs → boilerplate, empty ones included) plus, per file, the lines flagged by
the **latest review of each agent**. It is deterministic: path rules + stored rows only — **no model
call** — so grouping works before the first review. The classifier is a pure function that L08 will
reuse as a prompt filter.

## Scope

### Shared contract — BOTH copies (`server/src/vendor/shared`, `client/src/vendor/shared`)
`contracts/brief.ts`: `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`
(was `['core','wiring','boilerplate']`). Nothing else in the file changes. Both copies must be
byte-identical after the edit (pr-self-review then reports a **waivable** critical; the user adds the
waiver). `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff` are reused unchanged.

### Pure classifier — `src/modules/smart-diff/`
- `constants.ts` — the ONLY place with patterns and role order:
  `SMART_DIFF_RULES: readonly { role: SmartDiffRole; patterns: readonly string[] }[]` in evaluation
  order **boilerplate → tests → wiring → docs** (core = fallback), and
  `SMART_DIFF_GROUP_ORDER = ['core','tests','wiring','docs','boilerplate']` (response order).
- `classify.ts` — `classifyFile(path: string): SmartDiffRole`; first matching rule wins, else `core`.
  Imports only `./constants.js`, the contract type and a local glob helper — no Fastify, Drizzle,
  `src/db`, adapters or `node:` I/O.
- Patterns = the ASSIGNMENT list (globs on the repo-relative path, case-sensitive; `**/` also matches
  zero directories, so `**/*.md` matches `README.md`):

| Role | Patterns |
|---|---|
| boilerplate | `**/*.lock`, `**/pnpm-lock.yaml`, `**/package-lock.json`, `**/yarn.lock`, `**/dist/**`, `**/build/**`, `**/__snapshots__/**`, `**/*.snap`, `**/*.generated.*`, `**/*.min.js` |
| tests | `**/*.test.ts`, `**/*.test.tsx`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**` |
| wiring | `**/index.ts`, `**/index.js` (barrels), `**/*.config.*`, `**/tsconfig*.json`, `**/.eslintrc*`, `**/.env*`, `**/docker-compose*.yml`, `.github/**`, `.claude/**` |
| docs | `**/*.md`, `docs/**`, `**/README*`, `**/CHANGELOG*`, `**/LICENSE` |
| core | everything else (incl. `package.json`, migrations, `messages/**/*.json`) |

- Disputed cases pinned by the order: `__tests__/__snapshots__/x.snap` → boilerplate (boilerplate beats
  tests); `.claude/skills/security/SKILL.md` → wiring (wiring beats docs); `e2e/README.md` → tests
  (tests beat docs).

### Builder — pure, same module
`buildSmartDiff(files: { path; additions; deletions }[], findings: { file: string; startLine: number }[]): SmartDiff`
- Each file → `{ path, additions, deletions, pseudocode_summary: null, finding_lines }`;
  `finding_lines` = sorted unique `start_line`s of findings with `file === path`.
- **All five groups, always**, in `SMART_DIFF_GROUP_ORDER`; a group with no files has `files: []`.
  Files inside a group keep the input (GitHub) order.
- `split_suggestion = { too_big: total_lines > SMART_DIFF_LARGE_PR_LINES, total_lines: Σ(additions + deletions), proposed_splits: [] }`
  with `SMART_DIFF_LARGE_PR_LINES = 1000` in `constants.ts` (deterministic, no model call).

### Route — `GET /pulls/:id/smart-diff` (module `smart-diff`, registered in `src/modules/index.ts`)
- `getContext` → workspace; PR looked up by `(workspaceId, id)` → 404 `NotFoundError` otherwise.
- Files = persisted `pr_files` rows of the PR (as stored by `GET /pulls/:id`; no GitHub call).
- Findings = the **latest review of each agent**: per `agent_id` (a `null` agent counts as one bucket)
  the newest `reviews` row with `kind = 'review'` for this PR; their findings with `dismissed_at IS NULL`,
  merged. No review → `finding_lines: []` everywhere.
- Reads via `container.reviewRepo` (reviews/findings) and a module repository for `pr_files` — no imports
  from another module's folder; no new layer violations.
- Response parsed with `SmartDiff` before sending.

## Out of scope
- `pseudocode_summary` and real `proposed_splits` (need a model / a later lesson).
- Findings from older reviews of the same agent.
- Findings whose `file` is not among the PR files (they stay in the Findings panel).

## Acceptance criteria

### P1 — must
- **S1** `SmartDiffRole` is `['core','tests','wiring','docs','boilerplate']` in both vendor copies and the
  two `contracts/brief.ts` files are byte-identical (`cmp` exits 0); `test/contracts.test.ts` parses a
  `SmartDiff` with all 5 roles and rejects an unknown role.
- **S2** `classifyFile` passes a table test "path → role" (written FIRST, RED before the implementation)
  with ≥ 1 row per pattern above, the core fallback, and the 3 disputed cases exactly as pinned.
- **S3** Rule order lives only in `constants.ts` (`classify.ts` iterates `SMART_DIFF_RULES`; a test
  feeding a reordered rule list to the matcher flips a disputed case).
- **S4** `classify.ts` / `constants.ts` import nothing from Fastify, Drizzle, `src/db`, `src/adapters` or
  `node:*` (grep test + `node scripts/check-architecture.mjs` adds no new violation).
- **S5** `buildSmartDiff` unit test: exactly 5 groups in fixed order **including empty ones**
  (`files: []`), in-group order = input order, `finding_lines` sorted + de-duplicated + per path,
  `total_lines` = Σ(add+del), `too_big` = `total_lines > 1000` (1000 → false, 1001 → true),
  `proposed_splits: []`.
- **S6** `GET /pulls/:id/smart-diff` (`*.it.test.ts`) returns a body `SmartDiff.parse` accepts, with 5
  groups and the seeded PR's files in the expected groups.
- **S7** Workspace scoping: the same request for a PR of another workspace → 404.

### P2 — should
- **S8** No model call: the route works with an LLM provider that throws on any call (asserted zero
  calls) and before any review exists (all `finding_lines` empty, 5 groups present).
- **S9** Findings = latest `kind='review'` review **per agent**, merged: with agent A (old + new review)
  and agent B (one review), `finding_lines` contain A-new + B lines, not A-old; dismissed findings are
  excluded (`*.it.test.ts`).

### P3 — nice
- **S10** Unknown PR id (well-formed uuid) → 404; malformed id → 422 `validation_error` (`IdParams`; the app's error handler maps every Zod params failure to 422 — `src/app.ts` setErrorHandler).
