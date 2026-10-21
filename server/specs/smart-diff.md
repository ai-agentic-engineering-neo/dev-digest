# Smart Diff — server

Role-grouped view of a pull request's changed files: the API groups
`pr_files` into five roles and reports which files carry review findings. This
file owns the route, the classifier, the finding selection and the contract
additions. The UI half (Files changed tab, inline findings, toggles) lives in
[`client/specs/pages.md`](../../client/specs/pages.md), section "Tab `diff`".

Status: **implemented 2026-10-06**. No migration (seed data only). No model
call and no GitHub call: the route reads persisted rows.

## API (`modules/smart-diff/routes.ts`)

| Route | Result |
|---|---|
| `GET /pulls/:id/smart-diff` | `SmartDiff` (`SmartDiffResponse`). 404 when the PR is not in the caller's workspace. 422 on a non-uuid `:id` (the shared `IdParams` behaviour). |

The route declares `response: { 200: SmartDiffResponse }`, so the serializer
validates every body against the contract.

## Contract (`vendor/shared/contracts/brief.ts`, both copies)

| Field | Meaning |
|---|---|
| `SmartDiffRole` | `core` · `tests` · `wiring` · `docs` · `boilerplate`; declaration order is display order |
| `SmartDiff.groups` | always five entries in `ROLE_ORDER`; a role with no files has `files: []` |
| `SmartDiff.has_review` | `true` when at least one review of kind `review` exists for the PR |
| `SmartDiffFile.finding_lines` | sorted distinct `start_line` of the file's **non-dismissed** findings |
| `SmartDiffFile.finding_ids` | ids of **all** the file's findings, dismissed included, so the client can keep rendering a rejected finding |
| `SmartDiffFile.pseudocode_summary` | always `null` (would need a model call) |
| `SmartDiff.split_suggestion` | deterministic, see invariant 8 |

No new exported contract names were added; only the fields and enum members
above.

## Classifier (`modules/smart-diff/constants.ts`)

`ROLE_RULES` is the single table; `ROLE_ORDER` the single order. A path is
lower-cased, backslashes become `/`, and the first role whose pattern matches
wins. Precedence is **boilerplate, tests, docs, wiring**; nothing matching
means `core` (`DEFAULT_ROLE`).

| Role | Matches |
|---|---|
| boilerplate | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.sum`, `cargo.lock`, `*.lock`, `*.min.js\|css`, `*.generated.*`, `*.snap`, `*.map`, a `dist/` or `build/` segment, `db/migrations/meta/` |
| tests | `__tests__/`, `__fixtures__/`, `__mocks__/`, `*.test.*`, `*.spec.*` (so `*.it.test.*` too), `test/`, `tests/`, `e2e/` segments, `*.flow.json` |
| docs | `*.md`, `*.mdx`, `*.rst`, any `docs/` or `doc/` segment, `LICENSE*`, `CHANGELOG*` |
| wiring | `package.json`, `tsconfig*.json`, `*.config.js\|cjs\|mjs\|ts`, `.eslintrc*`, `Dockerfile`, `docker-compose*.yml`, `.github/`, `.env.example`, `index.ts\|tsx\|js`, `server\|app\|main\|config\|routes\|container .ts\|js`, root-level `*.json\|yaml\|yml\|toml` |
| core | everything else |

Contested cases fixed by the precedence (asserted in
`test/smart-diff-helpers.test.ts`): `package.json` is wiring, not boilerplate;
`src/foo/__fixtures__/user.json` is tests, not wiring; `src/middleware/README.md`
is docs; `src/config.ts` is wiring; `src/middleware/ratelimit.ts` is core;
`test/ratelimit.test.ts` is tests.

## Invariants

1. **One classifier.** Every pattern and the role order live in
   `modules/smart-diff/constants.ts`; `classifyPath` and `buildSmartDiff`
   (`helpers.ts`) are pure and read nothing else. The client never classifies a
   path.
2. **Five groups, fixed order.** `buildSmartDiff` maps over `ROLE_ORDER`, so
   the response has `core, tests, wiring, docs, boilerplate` even when a group
   is empty.
3. **Latest review per agent.** `SmartDiffRepository.getInputs` selects
   `DISTINCT ON (agent_id)` over `reviews` with `kind = 'review'`, newest
   `created_at` first, and reads findings of those reviews only. Postgres
   treats `NULL` agent ids as one group, so the seeded review (no agent)
   counts once. Older reviews of the same agent are ignored.
4. **Open vs all.** `finding_lines` excludes dismissed findings
   (`dismissed_at` set); `finding_ids` includes them.
5. **Unmatched findings are ignored.** A finding whose `file` equals no
   `pr_files.path` appears in no group.
6. **Within-group order.** Open finding count desc, then `additions +
   deletions` desc, then path (`localeCompare`).
7. **Workspace scope.** `getInputs(workspaceId, prId)` first filters
   `pull_requests.workspace_id`; it returns `undefined` for a foreign or
   unknown PR and `SmartDiffService.get` throws `NotFoundError('Pull request
   not found')` (404).
8. **Split suggestion.** `total_lines` is the sum of `additions + deletions`
   over all files; `too_big` is `total_lines > SPLIT_THRESHOLD_LINES` (400, the
   PR-list "L" bucket); when `too_big`, `proposed_splits` has one
   `{ name: <role>, files }` per non-empty group except boilerplate, else `[]`.
   The client does not render it.
9. **No model call, no run row.** The route touches no `llm` and creates no
   `agent_runs` row (`test/smart-diff.it.test.ts` asserts the mock LLM call
   count is 0 and the `agent_runs` count does not grow).
10. **Reads persisted files.** `pr_files` is written only by `GET /pulls/:id`,
    so the route returns no groups for a PR whose detail was never fetched.

## Module shape (onion rings)

`constants.ts`, `helpers.ts`, `service.ts` (`SmartDiffService`, deps
`{ repo }`) ring 2; `ports.ts` (`SmartDiffInputs`, `SmartDiffRepositoryPort`,
`SmartDiffDeps`) ring 1; `repository.ts` (`SmartDiffRepository`) ring 3a;
`routes.ts` ring 3b, building the service from `container.smartDiffRepo`. The
container getter is typed as the port and has a `ContainerOverrides.smartDiffRepo`
hook for hermetic route tests. The module imports nothing from other modules.

## Seeded data

`db/seed.ts` gives PR #482 nine files covering every role:
core `src/middleware/ratelimit.ts`, `src/api/public/webhooks.ts`,
`src/api/users.ts`; wiring `src/config.ts`, `src/server.ts`, `package.json`;
tests `test/ratelimit.test.ts`; docs `docs/rate-limiting.md`; boilerplate
`package-lock.json`. `src/config.ts` has a `patch` whose new line 12 is
`stripeKey: "STRIPE_KEY_PLACEHOLDER"` (anchors the seeded CRITICAL finding);
`src/api/users.ts` has none (its WARNING finding is "outside the diff"). Only
fresh databases get these files; the seed is idempotent and skips an existing
PR.

## Tests

`test/smart-diff-helpers.test.ts` (path to role table, grouping, split),
`test/smart-diff-routes.test.ts` (no DB, fake repo: 200 parses `SmartDiff`, 404,
422), `test/smart-diff.it.test.ts` (Postgres: latest review per agent,
`NULL` agent, dismissed handling, foreign workspace, no model call),
`test/contracts.test.ts` (new role and fields).

## Open questions

- Files are not ranked by `file_rank` from repo-intel; order is by open
  findings and churn only.
- `pseudocode_summary` stays `null` until a model-backed summary exists.
