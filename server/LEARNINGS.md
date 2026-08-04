# server — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

Covers `server/` and its submodules, including
`server/src/modules/repo-intel` (no separate file for it).

## What Works

### 2026-07-28 — per-run cost is already computed; the pipeline just drops it

`reviewer-core` computes cost end-to-end with no extra API calls:
`OpenRouterProvider.completeStructured` (`reviewer-core/src/llm/openrouter.ts`)
asks OpenRouter for `usage: { include: true }`, prefers OpenRouter's own
`usage.cost`, and falls back to the injected `estimateCost` (wired from
`platform/price-book.ts` → `adapters/llm/pricing.ts` in `container.ts`).
`reviewPullRequest` then sums it into `ReviewOutcome.costUsd`.

Commit `d45ab0d` removed only the *persistence* of that value, not its
computation — `run-executor.ts` was destructuring `const { tokensIn,
tokensOut, grounding } = outcome;` and silently discarding `costUsd`. So
surfacing run cost is a wiring job (schema column + `completeAgentRun` +
contracts), never a provider/pricing job. Check what `ReviewOutcome` already
carries before adding anything to the LLM path.

Caveat from `reviewer-core/src/review/run.ts`: on the map-reduce strategy
`costUsd` collapses to `null` if *any* chunk lacks a cost — so null means
"unknown", and must not be rendered as $0.

### 2026-08-03 — the `conventions` table and `getConventionSamples` sat fully-provisioned and completely unused for a whole lesson

Before the Conventions Extractor (specs/03) was built, the `conventions`
table, the `ConventionCandidate` contract, the `conventions` `FeatureModelId`
(wired into Settings), and `repoIntel.getConventionSamples(repoId, n)` all
already existed in the tree — zero readers, zero writers, zero routes. Only
`repoIntel.getConventionSamples` had a real implementation (it's just
`getTopFilesByRank` under a different name); everything else was schema/
contract scaffolding waiting for a module. Before assuming a feature needs
new schema, grep for its likely table/contract name — this repo tends to lay
groundwork a lesson or two ahead of the code that uses it.

Because the table had never been written to, redesigning it in place (tri-state
`status` instead of a boolean `accepted`, added `scan_id`/line-range/`category`
columns) was free — no migration had to preserve old rows, no back-compat
shim needed. Confirm "unused" with a repo-wide grep for the table/type name
before assuming the same is safe elsewhere.

## What Doesn't Work

### 2026-08-03 — `drizzle-kit generate` hangs (spins CPU, never prompts, never exits) under piped/non-TTY stdin when it needs a rename-ambiguity answer

Dropping a column and adding several new ones to the same table in one
schema-change pass makes `drizzle-kit generate` ask an interactive "is this a
rename?" question via a raw-mode terminal prompt. Piping input at it
(`yes "" | pnpm db:generate`, `pnpm db:generate < /dev/null`) does not answer
the prompt — the prompt library needs a real TTY for `setRawMode`, and
without one it spins at ~90%+ CPU indefinitely rather than erroring or
defaulting. `< /dev/null` alone hung for 90+ seconds before being killed; no
timeout, no visible progress.

Fix: split the schema change into two generate passes that are each
unambiguous on their own — pass 1 adds only new columns (temporarily keep the
old column so nothing is dropped, no rename candidate exists), pass 2 removes
the old column alone (nothing new was added, so nothing to rename it *to*).
Two small migrations instead of one, but `pnpm db:generate < /dev/null` then
exits cleanly with no prompt at all. Do this preemptively for any migration
that both drops and adds columns on the same table — don't discover the hang
by waiting on it.

## Codebase Patterns

### 2026-07-28 — list endpoints denormalize per-PR data with IN-query + JS grouping, not SQL joins

`GET /repos/:id/pulls` (`modules/pulls/routes.ts`) does not join `reviews` or
`agent_runs`. It collects `prIds`, runs one `inArray(...)` query ordered
`desc(createdAt/ranAt)`, and takes first-seen-per-PR in a JS `Map` as "the
latest". Follow that shape when adding another per-PR column (I added the
`latestRunByPr` block for tokens/cost this way).

Non-obvious part: the newest `agent_runs` row for a PR is frequently *not*
`done` (still running, or failed). Gate on `status === 'done'` when building
the map, otherwise the list shows a half-finished run's zeroed tokens — or
worse, silently falls through to an older run's numbers as if they were
current.

### 2026-07-28 — `vendor/shared` copies have already drifted

Diffing `server/src/vendor/shared` against `client/src/vendor/shared` shows
they're not identical: server has `sessionId`, the `openrouter` provider id,
`CommitFile`/`CommitFilesPayload` that client's copy lacks. There is no sync
script — editing a shared contract in one copy does not propagate to the
other; the other package keeps stale types and still type-checks clean.

### 2026-08-03 — a new module needing another module's repo/service must use the `AgentLookup`-style local port, not a direct import — `pnpm arch` catches it, but only per-file

`no-cross-module` in `.dependency-cruiser.cjs` fires on ANY file inside a
module folder — `service.ts` and `routes.ts` alike, not just services — so
composing a new module (`conventions/{service,routes}.ts`) by importing
another module's repository or service class directly fails CI immediately
(6 errors from one new module in `add page conversations`, 2026-08-03). The
established fix, already used by `reviews/service.ts`'s `AgentLookup`
(`modules/reviews/service.ts:1-12`): declare a narrow interface locally in the
consuming service describing only the methods it calls, and let the real
class satisfy it structurally — never import the other module's type. Wire
the concrete instance only at the composition point (`routes.ts`), and if the
dependency is cross-cutting (a repository, or a same-shaped instantiation
every module would otherwise repeat), promote it to a `platform/container.ts`
getter (`container.repoRepo`, `container.skillsService`) instead of
`new XRepository(app.container.db)` inline in the route — mirrors the existing
`agentsRepo`/`skillsRepo`/`reviewRepo` getters. `service.ts` files additionally
may not import `Container` at all (`no-container-in-services`), including
type-only — so a container-dependent helper (e.g. `resolveFeatureModel`) needs
its signature narrowed to the one thing it actually reads (here: `Db`, not the
whole `Container`) before it can be called from a `service.ts` at all, and
before `container.ts` can wrap it as a method without creating an import cycle
(`container.ts → feature-models.ts → container.ts`).

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-07-28 — `.nullable()` on a shared contract breaks every fixture that builds it

Adding `cost_usd: z.number().nullable()` to `RunStats`/`RunSummary`
(`vendor/shared/contracts/trace.ts`) makes the *key required* — value may be
null, presence may not. Every object literal building one of those types
stops compiling until the field is added, including test fixtures far from
the change (`server/test/contracts.test.ts` `RunTrace` fixture, client's
`RunHistory.test.tsx` / `RunTraceDrawer.test.tsx`).

Use `.nullable()` when siblings are required-but-nullable (`RunStats`,
`RunSummary`); use `.nullish()` for `PrMeta`-style optional-tolerant types
where `score`, `opened_at` etc. are already `.nullish()`. Picking the wrong
one is not caught by tests — it shows up as a spray of TS2741/TS2719 errors
in unrelated files, or as a field that silently goes missing from responses.

### 2026-08-03 — a `*/` inside a JSDoc comment's own text silently truncates the comment, and the cascade of errors points nowhere near the cause

Writing `.claude/skills/*/SKILL.md` or `` `*/SKILL.md` `` inside a `/** ... */`
block (describing a glob path) closes the comment at that literal `*/` —
whatever the comment meant to say next becomes real code. `tsc` doesn't error
at that line; it errors dozens of lines later, wherever the resulting
stray-identifier soup finally produces something structurally invalid
(`TS1127 Invalid character`, `TS1443 Module declaration names...`, `TS1161
Unterminated regular expression`). The line numbers in the diagnostic are
nowhere near the actual bug.

Found in `modules/skills/helpers.ts` (written by an agent, describing
`SKILL.md`-matching glob patterns in its own doc comments) — two separate
occurrences, ~30 and ~90 lines before their respective error clusters started.
The fix is always the same: grep the file for `\*/` and check whether every
hit is an *intentional* comment terminator (`grep -n '\*/' file.ts`, read each
one). When a comment must describe a path containing `*/`, rephrase around it
("matches `SKILL.md` at any depth") rather than writing the literal glob.

### 2026-08-03 — two independent enabled-gates, not one: don't let "disabled" collapse to a single flag

Skills (L02) are gated twice: `skills.enabled` (workspace/vetting — is this
skill trustworthy at all) and `agent_skills.enabled` (per-agent — does *this*
reviewer use it). A skill reaches a prompt only when both are true, and they
must stay genuinely independent columns, not one derived from the other:
disabling a skill workspace-wide must silently drop it from every agent's
prompt while every agent's own checkbox stays visibly checked (so re-enabling
the skill instantly restores every agent that had it), and toggling the
per-agent gate off must NOT delete the `agent_skills` row — deleting it loses
`order`, and re-linking would append the skill to the end of the prompt instead
of restoring its place. `AgentsRepository.setSkillEnabled` upserts in place for
exactly this reason; `AgentsRepository.enabledSkills` ANDs both flags in one
query rather than checking them in two places that could drift apart.

### 2026-08-03 — evidence verification, not model honesty, is what makes "every candidate cites real code" true

The Conventions Extractor's LLM call (`ConventionsService.extract`) is
explicitly instructed to quote real snippets, but the guarantee that evidence
is real does NOT come from the prompt — it comes from
`findSnippetLines` (`modules/conventions/evidence.ts`) re-reading the cited
file off the clone and searching for the snippet (whitespace-normalized) after
the model responds. A candidate whose file is missing or whose snippet isn't
found is dropped before it ever reaches the DB or the UI. Same shape as
`groundFindings` in reviewer-core (never trust a citation without checking it
against the source), but this one runs in the *server* module rather than the
shared review engine, because conventions extraction isn't a
`reviewPullRequest` call at all — one-off structured calls that aren't PR
reviews still need their own citation-checking step; there's no shared gate to
reuse for them.

Also: sample selection for this feature is entirely code — no LLM call. The
mock adapter's `structuredBySchema` comment anticipated a two-step
`ConventionFileSelection` → `ConventionExtraction` dialogue, but the actual
task requirement was explicit that file *selection* is code-driven
(`repoIntel.getConventionSamples` + reading config files off the clone) and
only *extraction* is a model call. Don't assume mock/comment scaffolding
describes the final design — it can describe a design that was later narrowed.

### 2026-08-03 — `GitClient.currentHead(repo: RepoRef)` already resolves a real commit sha; no new method needed to pin evidence links

Needed a commit sha to build GitHub blob URLs for evidence found by scanning a
repo generally (not tied to a PR's `headSha`). `SimpleGitClient.currentHead`
(`adapters/git/simple-git.ts`) already runs `git rev-parse HEAD` — it just
takes a `RepoRef` (`{owner, name}`), not a raw `clonePath` string, and derives
the path itself via `clonePathFor`. Since GitHub blob URLs need
`owner/name` anyway, this was already the right shape with no new adapter
method. Check the `GitClient` interface (`vendor/shared/adapters.ts`) before
adding a path-based read — most of what you'd want (`currentHead`, `readFile`,
`log`) already exists keyed by `RepoRef`.

### 2026-08-03 — the file-import SSRF guard pattern: validate before fetch, size-cap the stream, not just Content-Length

`SkillsService.parseImportFromUrl` fetches a user-typed URL server-side. Two
things worth reusing verbatim for the next feature that does this:
(1) `assertPublicHttpUrl` (`modules/skills/helpers.ts`) is a pure, unit-tested
deny-list (http/https only, refuse localhost/loopback/private ranges/link-local
inc. the cloud metadata address) checked BEFORE the fetch ever fires — a test
asserts `global.fetch` was never called for a blocked host, not just that the
call errors. (2) The response body is read via a manual `getReader()` loop
that aborts once bytes read exceed `MAX_UPLOAD_BYTES`, because a server can lie
about or omit `Content-Length` — trusting that header alone doesn't cap a
slow-drip or large-body response. Both guards are pure/testable without a real
network call (mock `global.fetch` returning a hand-rolled `ReadableStreamDefaultReader`).

### 2026-08-04 — the 2026-08-03 SSRF guard entry above was incomplete: `redirect: 'follow'` walks straight past `assertPublicHttpUrl`, no DNS control needed

`assertPublicHttpUrl` only validates the URL string it's called with — it's
never re-run against a redirect target. `fetchSkillText`
(`modules/skills/service.ts`) fetched with `redirect: 'follow'`, so a host
that passes the check on its own URL (e.g. `https://example.com/skill.md`)
could 302 to `http://169.254.169.254/latest/meta-data` and the fetch would
follow it with zero further validation — no DNS rebinding attack needed, just
one HTTP redirect. Caught by an automated PR review (branch
`feat/L02-page-conversation`), not by the existing unit tests, because every
test's mocked `fetch` returned a terminal response directly.

Fix: `redirect: 'manual'` + a loop that reads `res.headers.get('location')`,
resolves it against the current URL, re-validates it through
`assertPublicHttpUrl` before the next `fetch`, and bails past
`MAX_URL_REDIRECTS` hops (`modules/skills/constants.ts`). Any future
server-side fetch of a user-supplied URL needs the same treatment — passing
the SSRF guard once at the top is not enough if the fetch call itself is
allowed to follow redirects.

Same fix pass also closed a second gap in that code path: the `AbortController`
timeout was cleared in the `finally` right after `fetch()` resolved (i.e. once
headers arrived), but the response body was then read afterward via a manual
`getReader()` loop with no active timeout — a slow-drip body (each chunk under
`MAX_UPLOAD_BYTES` cumulative) could hold the request open indefinitely since
only the byte cap, not a time cap, applied during the read. Fix: keep the
timeout alive for the whole operation (`clearTimeout` moved to run after the
read loop, not after `fetch()`), so an abort during body-reading now also
throws the same "Timed out fetching…" `ValidationError`.

### 2026-08-03 — findings attribution from `run_skills` is RUN-level, not skill-level, and the UI must say so

`run_skills` records which skills were injected into *a run's* prompt, not
which skill produced *which finding* — the model doesn't (yet) name a skill
per finding. So a run that injected four skills has all of its findings
counted toward all four skills' stats. This over-counts by design, and
`SkillsRepository`'s `findingCounts`/`findingsByCategory` comments call it out
explicitly so nobody "fixes" the over-count into a false precision the data
doesn't support. The Stats tab's panel title reflects this too: "Findings in
runs using this skill", never "caused by". If per-finding attribution is ever
wanted, it needs the `Review` schema to carry a skill reference per finding —
a real schema change, not a stats-query fix.

### 2026-08-03 — a reserved-but-unwired column can name the exact integration point for the feature that will fill it

`skills.evidenceFiles` had a code comment in `modules/skills/helpers.ts`
("stays null until the Conventions extractor") for a whole lesson before that
extractor existed. When it was time to populate it, the column existed but
`SkillsService.create`/`SkillsRepository.insert` had never threaded an
`evidenceFiles` field through — the DTO mapper (`toSkillDto`) already read it,
nothing ever wrote it. Threading one optional field through
`CreateSkillInput` → `InsertSkill` → the insert `.values()` was the entire
change; no schema migration needed, since the column had shipped speculatively
in spec 02's migration. When a column's comment names a future feature,
that's usually the whole integration contract, not just documentation.

### 2026-08-03 — `.dependency-cruiser-known-violations.json` baselines exact from→to edges, not files — narrowing a param type can silently add a new violation next to an already-ignored one

Changing `getFeatureModelOverride`/`resolveFeatureModel`
(`modules/settings/feature-models.ts`) to take `Db` instead of `Container` (to
break an import cycle — see the port-injection entry above) turned a
type-only `Container` import into a value import of `db/client.ts`. The file
already had a *grandfathered* `db-only-in-repositories` violation for
`db/schema.ts` on the same file, but the baseline matches on the literal
`to` path, so the new `db/client.ts` edge was NOT covered and failed `pnpm arch`
even though it's the same pre-existing class of debt (settings module reads
`t.settings` directly, bypassing a repository). Fix was `pnpm arch:baseline`
(regenerates the whole file) — diff it afterward (`git diff
.dependency-cruiser-known-violations.json`) to confirm it added only the one
expected edge and didn't silently swallow an unrelated new violation elsewhere
in the tree.

## Session Notes

## Open Questions
