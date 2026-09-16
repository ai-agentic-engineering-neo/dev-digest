# 01-tasks-gitlab-provider-support.md

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|---|---|---|---|
| `AGENTS.md` (root + `server/`, `client/`) | not found | — | — |
| `CONTRIBUTING.md` (root) | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| root `README.md` | yes | Monorepo-of-standalone-packages layout; `server/`=`@devdigest/api`, `client/`=`@devdigest/web`; shared Zod contracts canonically live at `server/src/vendor/shared` (`@devdigest/shared`) | none |
| `server/CLAUDE.md` | yes | `src/vendor/shared` is the single source of truth for shared contracts — edit there, not locally; `*.it.test.ts` = integration (needs Postgres), everything else hermetic; `src/adapters` = external integrations; `src/vendor/` marked do-not-touch for *independent* local edits (see conflict) | see below |
| `client/CLAUDE.md` | yes | API calls only via `src/lib/hooks/*`; pages thin, feature logic in colocated `_components/<Name>/`; `src/vendor/ui`, `src/vendor/shared` marked "vendored/synced, not owned here" | see below |
| `server/package.json` scripts | yes | `pnpm typecheck`, `pnpm test` (=`vitest run`), `pnpm db:generate` (drizzle-kit), `pnpm db:migrate` | none |
| `.github/workflows/server-unit.yml` | yes | CI runs `pnpm typecheck` then `pnpm exec vitest run --exclude '**/*.it.test.ts'` for `server/**` changes — confirms the spec's hermetic-suite command | none |
| `.github/workflows/client.yml` | yes | CI runs `pnpm typecheck` then `pnpm test` for `client/**` changes | none |
| lint/format config (`.eslintrc*`, `eslint.config*`, `.prettierrc*`) | not found at repo/server/client root | — | — |

**Conflict noted and resolved:** `server/CLAUDE.md` and `client/CLAUDE.md` both mark `src/vendor/` as "do-not-touch" / "not owned here," but `server/CLAUDE.md` simultaneously calls `src/vendor/shared` "the single source of truth ... change the type there, not locally." `git log -- server/src/vendor/shared client/src/vendor/shared` shows every prior contract change touches both paths in the same commit (e.g. `b407ba1`, `97b6edc`, `93119a5`). Resolution carried into the tasks below: treat `server/src/vendor/shared` as the canonical edit target and `client/src/vendor/shared` as a same-commit mirror — never edited independently, never a divergent local fork. This matches the spec's Repository Standards section.

No lint/format policy file exists to extract rules from; `pnpm typecheck` + `vitest` are the only enforced gates found.

## Tasks

### [ ] 1.0 Contracts & repo identity foundation

#### 1.0 Proof Artifact(s)
- Test: a URL-parser table test (`server/src/modules/repos/helpers.test.ts`) covering `github.com` https/ssh, `gitlab.com` https/ssh, a nested `group/subgroup/project` GitLab URL, and an unrecognized-host URL (expects `invalid_repo_url`) — demonstrates FR "parse owner/name from both hosts including nested namespaces."
- Migration: `pnpm db:generate` output migration file under `server/src/db/migrations/`, plus a successful `pnpm db:migrate` run against local Postgres followed by `SELECT provider FROM repos` showing pre-existing rows read `'github'` — demonstrates FR "provider column, NOT NULL DEFAULT 'github', backfilled."
- Test: `POST /repos` with a `gitlab.com` URL (`server/src/modules/repos/routes.test.ts` or equivalent) returns a body whose `provider` field is `"gitlab"` — demonstrates FR "persist and return detected provider."

#### 1.0 Tasks
TBD

### [ ] 2.0 Provider-neutral code-host adapter

#### 2.0 Proof Artifact(s)
- Test: mocked-HTTP adapter tests, one per method (list/get MR, list discussions + create note + reply, approve/unapprove/comment review paths including REQUEST_CHANGES → unapprove+note, commit files, find/open MR, current identity) in `server/src/adapters/gitlab/*.test.ts` — demonstrates FR "GitLab REST adapter implementing the provider-neutral port."
- Test: a shared contract test run against both the GitHub and GitLab adapter mocks, asserting both satisfy the same interface and populate the same required `PrDetail`/`PrReviewComment` fields — demonstrates FR "one port, two implementations, no provider branching outside adapters."
- Test: a regression test asserting GitHub's `APPROVE`/`REQUEST_CHANGES`/`COMMENT` review payloads are byte-for-byte unchanged from before this feature — demonstrates "GitHub's existing review semantics are unchanged."

#### 2.0 Tasks
TBD

### [ ] 3.0 DI & server module wiring

#### 3.0 Proof Artifact(s)
- Test: adding a `gitlab.com` repo then calling refresh and the polling tick resolves the GitLab adapter (not GitHub) via a spy/mock injected through `ContainerOverrides` — demonstrates FR "provider factory selects client by repo's persisted provider."
- Test: `POST /settings/test-connection {provider: "gitlab"}` returns `ok: true`/`false` from a mocked GitLab identity call, and never returns the token in the response body — demonstrates FR "gitlab connection-test branch."
- Test: a GitLab repo with no `GITLAB_TOKEN` configured still returns cached/local PR data instead of throwing — demonstrates FR "offline fallback parity."

#### 3.0 Tasks
TBD

### [ ] 4.0 Client provider-aware UI & links

#### 4.0 Proof Artifact(s)
- Test: PR detail page and `FindingCard` component tests render a GitLab MR link (`/-/merge_requests/{n}`) and GitLab blob link (`/-/blob/{sha}/{path}#L{n}`) when `provider: "gitlab"`, and unchanged GitHub links when `provider: "github"` — demonstrates FR "generic URL builders per provider."
- Test: Settings page component test renders a GitLab connection-status row and reflects a mocked success/failure from the test-connection call — demonstrates FR "GitLab token status + test-connection action in Settings."
- E2E check (`e2e/specs/*.flow.json` or manual step, later formalized in 5.0): pasting a `gitlab.com` URL into "Add repository" auto-detects `provider: "gitlab"` before submit — demonstrates FR "detect provider from URL host on add."

#### 4.0 Tasks
TBD

### [ ] 5.0 Cross-cutting tests, token-safety verification & documentation

#### 5.0 Proof Artifact(s)
- CLI: `cd server && pnpm typecheck` exits 0.
- CLI: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` exits 0, including all new GitLab adapter/unit suites from 1.0–3.0.
- CLI: `cd client && pnpm typecheck && pnpm test` exits 0, including new URL-builder/component suites from 4.0.
- CLI: `cd e2e && npm run e2e:hermetic` exits 0, including a new combined GitHub+GitLab flow spec.
- CLI: a documented grep (e.g. `grep -rEi "(ghp_|glpat-)[A-Za-z0-9_-]{10,}"` or equivalent over `server/test`, `client/src/**/*.test.*`, committed fixtures/snapshots, and captured log output) returns zero matches — demonstrates "no raw token value appears in fixtures/snapshots/logs."

#### 5.0 Tasks
TBD
