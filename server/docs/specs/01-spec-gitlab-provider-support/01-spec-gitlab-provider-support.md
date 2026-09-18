# 01-spec-gitlab-provider-support.md

## Introduction/Overview

DevDigest currently talks to exactly one code host: GitHub, via a `GitHubClient` port and an Octokit implementation baked into every repo/PR/polling code path. This feature adds **GitLab.com** as a second, first-class provider — clone, indexing, Merge Requests (list/detail/diff/commits), reviews, inline comments/replies, polling, and PR/MR automation — by making the existing pipeline **provider-aware** instead of bolting on a parallel GitLab-only stack. Internally, both providers keep populating the same shared `Pr`-shaped model (`PrMeta`/`PrDetail`/`PrReviewComment`) so the review pipeline, findings, and UI stay provider-agnostic.

## Goals

1. A user can add a `gitlab.com` repo URL exactly like a GitHub one and get the same clone → index → list/view MR → diff → review → comment → automate flow.
2. `GitHubClient` becomes a provider-neutral port with two implementations (GitHub/Octokit, GitLab/REST); no module outside the adapters layer branches on provider-specific request/response shapes.
3. Every server module that currently assumes GitHub (`repos`, `pulls`, `polling`, `settings`) selects its code-host client from the repo's persisted `provider` field.
4. The client renders correct deep links (PR vs MR URL shapes) and lets a user add/see a repo's provider, with zero regression to existing GitHub-only links.
5. Existing GitHub repos and tests are unaffected (migration backfills `provider = 'github'`; GitHub-only test suites stay green).

## User Stories

- **As a user with projects on GitLab.com**, I want to add a `gitlab.com` repo URL so that I get the same import/review workflow I already have for GitHub.
- **As a user reviewing a GitLab merge request**, I want to see its diff, leave inline comments/replies, and publish an approve/comment/request-changes review, so that my GitLab workflow matches my GitHub one.
- **As a user with repos on both hosts**, I want polling, refresh, and automation (commit files, open/find PR) to keep working per-repo regardless of which host it lives on.
- **As a user configuring the app**, I want to set a GitLab token in Settings and see its connection status, the same way I do for GitHub.
- **As a developer maintaining DevDigest**, I want GitHub and GitLab to share one adapter interface and one `Pr` model, so that adding a provider doesn't fork the review pipeline.

## Demoable Units of Work

### Unit 1: Contracts & repo identity foundation

**Purpose:** Give every repo a persisted `provider`, and make URL parsing/host detection work for both GitHub and GitLab (including GitLab's nested namespaces), so later units have a typed, migrated foundation to build on.

**Functional Requirements:**
- The system shall add `provider: "github" | "gitlab"` to the shared `RepoInput` and `Repo` Zod contracts in the canonical `server/src/vendor/shared` package, and mirror the same change into the `client/src/vendor/shared` copy in the same change-set (matching this repo's existing pattern of editing both copies together).
- The system shall add a `provider` column to the `repos` table via a Drizzle migration, `NOT NULL DEFAULT 'github'`, so all existing rows backfill as `github` with no manual data migration step.
- The system shall parse `owner`/`name` from both `github.com` and `gitlab.com` URLs (https and ssh forms), including GitLab nested namespaces (`group/subgroup/project`), and shall reject URLs from unrecognized hosts with the existing `invalid_repo_url` `AppError`.
- The system shall treat `owner` as a (possibly multi-segment) namespace path rather than a single path segment, since GitLab groups can be nested.
- The system shall persist and return the detected `provider` when a repo is added, refreshed, or listed.
- The system shall extend the shared `ConnTestProvider` enum and `SecretsStatus` object with a `gitlab` member.

**Proof Artifacts:**
- Test: a URL-parser table test covering `github.com` https/ssh, `gitlab.com` https/ssh, a nested `group/subgroup/project` GitLab URL, and an unrecognized-host URL (expects `invalid_repo_url`).
- Migration: `pnpm db:generate` output file plus a successful `pnpm db:migrate` run against local Postgres, followed by a query showing pre-existing `repos` rows now read `provider = 'github'`.
- API test: `POST /repos` with a `gitlab.com` URL returns a body whose `provider` field is `"gitlab"`.

---

### Unit 2: Provider-neutral code-host adapter

**Purpose:** Turn the GitHub-only adapter port into a provider-neutral interface with two implementations, so the rest of the app can depend on one port regardless of host.

**Functional Requirements:**
- The system shall rename/generalize the `GitHubClient` port in `server/src/vendor/shared/adapters.ts` into a provider-neutral interface exposing the same operations (list/get PR-or-MR, post review, list/create review comments + replies, open PR/MR, commit files, find open PR/MR, get linked issue, current identity), implemented unchanged by the existing Octokit-backed client.
- The system shall add a GitLab REST (API v4) adapter implementing that same interface against `gitlab.com`, authenticated with `GITLAB_TOKEN`.
- The system shall map a GitLab merge request (list + detail) into the shared `PrMeta`/`PrDetail` shape, using the MR's project-scoped `iid` as `PrMeta.number` (never the global `id`).
- The system shall map GitLab discussions/notes into `PrReviewComment`, including inline diff-anchored notes (resolved via the MR's `diff_refs`: `base_sha`/`start_sha`/`head_sha`, plus `old_path`/`new_path`/`old_line`/`new_line`) and threaded replies.
- The system shall map GitLab commit/MR automation (branch create-or-update, commit files, open/find MR) onto the same shared automation operations the GitHub adapter implements for `commitFiles`/`openPullRequest`/`findOpenPr`.
- Given GitLab's approvals API has no `REQUEST_CHANGES` review event, the system shall implement `REQUEST_CHANGES` on a GitLab MR as: call `unapprove` for the authenticated user (a no-op if they had not approved), then post the review body as a discussion note prefixed with `"Changes requested: "`. `APPROVE` shall call GitLab's `approve` endpoint; `COMMENT` shall post a plain discussion note. GitHub's existing review semantics are unchanged.
- The system shall build an authenticated `https://gitlab.com/...` clone URL using `GITLAB_TOKEN`, mirroring `withGitHubToken`'s in-memory-only construction (never persisted, logged, or embedded in thrown errors).
- The system shall authenticate all GitLab REST calls via a request header (e.g. `PRIVATE-TOKEN` or `Authorization: Bearer`), never via a query-string token parameter, so tokens cannot leak into access logs.

**Proof Artifacts:**
- Mocked-HTTP adapter tests, one per method: list/get MR, list discussions + create note + reply, approve/unapprove/comment review paths (including the REQUEST_CHANGES → unapprove+note path), commit files, find/open MR, current identity.
- A shared contract test exercised against both the GitHub and GitLab adapters (via mocks), asserting both satisfy the same interface and produce a `PrDetail`/`PrReviewComment` with the same required fields populated.
- A regression test proving GitHub's `APPROVE`/`REQUEST_CHANGES`/`COMMENT` review payloads are byte-for-byte unchanged from before this feature.

---

### Unit 3: DI & server module wiring

**Purpose:** Wire the provider factory through the container and every server module that currently calls `container.github()` directly, so the correct client is chosen per-repo.

**Functional Requirements:**
- The system shall add `GITLAB_TOKEN` to server secrets/config loading and to `.env.example`, mirroring `GITHUB_TOKEN`.
- The system shall add a `gitlab` connection-test branch (`POST /settings/test-connection {provider: "gitlab"}`) that verifies the token against the GitLab identity endpoint, and a `gitlab` boolean on `GET /settings/secrets-status`.
- The system shall add a provider factory on the DI container (e.g. `container.codeHost(provider)`) that returns the GitHub or GitLab client for a given provider, and shall replace every direct `container.github()` call site in `repos`, `pulls`, and `polling` modules with a lookup keyed by the target repo's persisted `provider`.
- The system shall make repo clone-URL reconstruction (currently hardcoded to `https://github.com/${fullName}.git` in `RepoService.refresh`) provider-aware.
- The system shall preserve the existing local-first/offline fallback behavior (read-only repo/PR browsing continues to work without a live GitLab connection) with parity to the current GitHub offline fallback.
- The system shall route inline-comment creation/replies and review publishing through the provider factory, so GitLab repos use the GitLab adapter end to end.
- The system shall route PR/MR automation flows (commit files, open/find PR) through the same provider factory.

**Proof Artifacts:**
- Test: adding a `gitlab.com` repo, then calling refresh and the polling tick, resolves the GitLab adapter (not GitHub) — verified via a spy/mock injected through `ContainerOverrides`.
- Test: `POST /settings/test-connection {provider: "gitlab"}` returns `ok: true`/`false` based on a mocked GitLab identity call, without ever returning the token.
- Test: a GitLab repo with no `GITLAB_TOKEN` configured still returns cached/local PR data instead of throwing (offline fallback parity with the equivalent GitHub test).

---

### Unit 4: Client provider-aware UI & links

**Purpose:** Let a user add a GitLab repo and see correct GitLab deep links everywhere the app currently assumes `github.com`.

**Functional Requirements:**
- The system shall detect the provider from the pasted repo URL's host when adding a repository, and shall reject/flag URLs from unrecognized hosts (no silent fallback to GitHub).
- The system shall replace `client/src/lib/github-urls.ts` with generic URL builders that produce GitHub `/pull/{n}` and `/blob/{sha}/{path}#L{n}` links for `provider: "github"` repos, and GitLab `/-/merge_requests/{n}` and `/-/blob/{sha}/{path}#L{n}` links for `provider: "gitlab"` repos.
- The system shall update every existing call site of the GitHub-only URL builders (PR detail page, finding cards, comments, conventions view) to use the generic builder keyed by the repo's `provider`.
- The system shall surface GitLab token status and a test-connection action in the Settings page, alongside the existing GitHub row.
- The system shall (where the repos list UI already shows per-repo metadata) show the provider so a user with both GitHub and GitLab repos can tell them apart.

**Proof Artifacts:**
- Component test: the PR detail page and `FindingCard` render a GitLab MR link (`/-/merge_requests/{n}`) and a GitLab blob link (`/-/blob/{sha}/{path}#L{n}`) when the repo's `provider` is `"gitlab"`, and unchanged GitHub links when it is `"github"`.
- Component test: the Settings page renders a GitLab connection-status row and reflects a mocked success/failure from the test-connection call.
- E2E/manual check: pasting a `gitlab.com` URL into "Add repository" auto-detects `provider: "gitlab"` before submit.

---

### Unit 5: Tests & documentation

**Purpose:** Lock in provider-aware behavior with tests at every layer already touched by Units 1–4, and document the new token/provider for future users and contributors.

**Functional Requirements:**
- The system shall have unit tests for URL parsing (both hosts, nested namespaces, invalid host), authenticated clone-URL construction, and the client's generic deep-link builders.
- The system shall have mocked-HTTP tests for the GitLab adapter covering MR list/detail, comments/discussions (including replies), identity, commits, and automation (from Unit 2).
- The system shall have tests exercising provider-aware clone/refresh, polling, offline fallback, and comment publishing for both providers (from Unit 3).
- The system shall have an end-to-end flow that imports one GitHub repo and one GitLab repo (fixtures/mocked network) and asserts both render their PR/MR list, detail, and diff correctly.
- The system shall have `.env.example`, the affected module READMEs, `docs/specs`, and Settings UI copy updated to document `GITLAB_TOKEN` and GitLab support.
- The system shall have no raw token value appear in any test fixture, snapshot, log line, or thrown error message — verified by an explicit check (grep over fixtures/snapshots plus a targeted test asserting adapter error messages never interpolate the token).

**Proof Artifacts:**
- `cd server && pnpm typecheck` clean.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` green, including all new GitLab adapter/unit suites.
- `cd client && pnpm typecheck && pnpm test` green, including new URL-builder/component suites.
- `cd e2e && npm run e2e:hermetic` green, including the new combined GitHub+GitLab flow.
- A documented (script or manual) grep across logs/fixtures/snapshots/test output showing zero token-value matches.

## Non-Goals (Out of Scope)

1. **Self-managed/on-prem GitLab:** only `gitlab.com` is supported; no configurable GitLab host/base-URL.
2. **Per-host or per-repository tokens:** a single global `GITLAB_TOKEN` is used, exactly like the existing global `GITHUB_TOKEN` — no per-repo credential storage or scoping UI.
3. **Live (non-mocked) GitLab API tests/CI:** all adapter tests run against mocked HTTP; no test suite makes real calls to `gitlab.com`.
4. **GitLab-only features with no GitHub analog beyond what the shared `Pr` model needs:** e.g. merge trains, squash-on-merge options, CI/CD pipeline status widgets, approval rules UI are not built, even though the adapter may incidentally touch related endpoints (e.g. `diff_refs`).
5. **Cross-provider repo migration:** no tooling to move an existing GitHub-tracked repo's history/PRs to a GitLab identity or vice versa.

## Design Considerations

No mockups were provided. The Settings page needs one new provider row (GitLab token status + "Test connection" button) that mirrors the existing GitHub row's layout. The "Add repository" flow needs either an auto-detected, silently-set provider (preferred, since the URL host is unambiguous) or a visible provider indicator once detected — no manual provider dropdown is required unless auto-detection proves ambiguous during implementation.

## Repository Standards

- `server/src/vendor/shared` is this repo's single source of truth for shared Zod contracts (per `server/CLAUDE.md`); despite `client/src/vendor/shared` being marked "vendored/synced, not owned here," this repo's actual convention (confirmed via `git log` on prior contract changes) is to edit both copies together in the same change-set. Follow that same pattern for every contract change in Unit 1 — do not build a separate sync tool.
- New server-side pure helpers (URL parsing, token-URL construction) belong in each module's existing `helpers.ts`/`constants.ts` split (see `server/src/modules/repos/{helpers,constants}.ts`), not inline in routes or services.
- Keep the hermetic/`*.it.test.ts` split: GitLab adapter tests are mocked-HTTP and belong in the hermetic suite, matching the existing GitHub adapter test placement.
- `server/src/adapters/` stays the home for external-integration implementations (`server/src/adapters/gitlab/...`), following the existing `server/src/adapters/github/octokit.ts` layout.

## Technical Considerations

- GitLab's project `:id` path parameter accepts either a numeric project id or a URL-encoded full path (`namespace%2Fproject`); the adapter can address projects by `owner/name` directly, with no separate project-id lookup/cache required.
- GitLab's MR-scoped `iid` (not the global `id`) is the number users see and the value that must populate `PrMeta.number`.
- GitLab has no `REQUEST_CHANGES` review event (confirmed against the official GitLab REST API docs, checked September 2026): approvals are `approve`/`unapprove` only, and blocking a merge on unresolved threads is a project-level setting, not a per-review action. This spec's target behavior (confirmed with the user): `REQUEST_CHANGES` → `unapprove` (no-op if not previously approved) + a discussion note prefixed `"Changes requested: "`; `APPROVE` → `approve`; `COMMENT` → a plain note.
- GitLab inline diff notes require the MR's `diff_refs` (`base_sha`/`start_sha`/`head_sha`) at comment-creation time, unlike GitHub's single `commit_id` — the adapter must fetch (and may cache per-MR) these refs before posting or replying to an inline note.
- GitLab threads replies via a discussion id (a hash-like string, `POST .../discussions/:discussion_id/notes`), distinct from an individual note's numeric id — the adapter must resolve/track the discussion id, not just the note id, to reply through the shared `in_reply_to` concept.
- The exact HTTPS clone auth scheme for `gitlab.com` (e.g. `oauth2:<token>@gitlab.com/...` vs. token-as-password) should be verified against a real `gitlab.com` clone during implementation, mirroring how `withGitHubToken` verified GitHub's `x-access-token` convention.

## Security Considerations

- `GITLAB_TOKEN` follows the existing `SecretsProvider`/`.env` pattern: never logged, never returned by any `/settings` response body, only ever read server-side.
- Authenticated GitLab clone URLs are constructed in-memory only and must never be persisted to `clone_path`, job payloads at rest, log lines, or thrown error messages — mirroring `withGitHubToken`.
- All GitLab REST calls authenticate via a request header, never a query-string token parameter (GitLab's API accepts a `private_token` query param, which is explicitly disallowed here since query strings land in access logs).
- No test fixture, HTTP mock, snapshot, or log output may contain a real or realistic-looking token value (Unit 5's verification step covers this explicitly).

## Success Metrics

1. All commands under "Перевірка" (`server` typecheck, `pnpm db:migrate`, focused adapter tests, `server` hermetic vitest, `client` typecheck+test, `e2e:hermetic`) pass with zero regressions in existing GitHub-only paths.
2. A `gitlab.com` repo can be added and driven through the full flow (clone → index → list/view MR → diff → inline comment/reply → review → automation) using only the key files identified in this spec.
3. Zero token-leakage findings across logs, fixtures, and snapshots (Unit 5's grep/check passes clean).
4. No behavior change or test regression on any existing GitHub-only repo/PR/review/automation path.

## Open Questions

- The exact `gitlab.com` HTTPS clone authentication scheme (oauth2-style vs. PAT-as-password) needs a quick real-world check during implementation — treated as a low-risk implementation detail, not a spec blocker.
- Whether "Add repository" should offer a manual provider override if host auto-detection is ever ambiguous (e.g. a self-hosted-looking URL) is left to implementation judgment, since self-managed GitLab is out of scope and any non-`github.com`/`gitlab.com` host should already fail via the existing `invalid_repo_url` path.
