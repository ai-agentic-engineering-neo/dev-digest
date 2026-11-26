# Examples — engineering-insights

## Vague → useful, per section

**Mistakes**
- ✗ `Server typecheck is flaky.`
- ✓ `- 2026-11-22 · Run \`cd reviewer-core && npm ci\` before server typecheck when it fails with TS2307 + cascading unknown→T errors — the server type-checks reviewer-core's raw source, which imports openai/zod. Evidence: \`scripts/dev.sh\` (reviewer-core install step)`

**Decisions**
- ✗ `Zod error handling is custom.`
- ✓ `- 2026-11-22 · Keep both ZodError checks in the error handler (instanceof AND name+issues shape) — shared and api load separate zod instances, so instanceof alone misses errors. Evidence: \`server/src/app.ts\` (\`setErrorHandler\`)`

**Context**
- ✗ `e2e can be unstable.`
- ✓ `- 2026-11-22 · Use \`npm run e2e:hermetic\`, not \`npm test\`, on a dev machine — flows 02/04/05 follow the home redirect to the first repo and fail when the dev DB has extra repos. Evidence: \`e2e/README.md\` (Precondition)`
- ✓ `- 2026-11-22 · Start \`next dev\` from client/ only — next-intl loads messages from process.cwd()/messages, so another cwd renders raw keys. Evidence: \`client/src/i18n/request.ts\` (\`loadMessages\`)`

**Patterns**
- ✗ `Use mocks in tests.`
- ✓ `- 2026-11-22 · Test routes without a port via buildApp({ overrides }) + app.inject(), with MockLLMProvider/MockGitClient — no keys, no Docker. Evidence: \`server/src/adapters/mocks.ts\`, \`server/src/app.ts\` (\`buildApp\`)`

**Open Questions**
- ✓ `- 2026-11-22 · Unclear whether boot-time reapStaleRuns should skip fresh runs if two API processes share one DB. Evidence: \`server/src/app.ts\` (\`reapStaleRuns\` call)`

**User correction (highest priority signal)**
- Situation: the agent edited `0003_minor_overlord.sql`; the user said "never edit migrations, generate a new one".
- Already in AGENTS.md → write nothing. If the correction were NOT in AGENTS.md, record it in Decisions and propose adding it to AGENTS.md.

## Do NOT write
- `Always validate input with Zod.` — general knowledge.
- `Fixed typo in AgentCard.` — trivial, no future impact.
- `GitHub API timed out once.` — transient.
- `Migrations must not be edited.` — already in AGENTS.md.
- `Maybe the timeout is caused by ripgrep.` — unverified → Open Questions, or nothing.
- `Be careful with the database layer.` — not actionable: no file, no symptom, no fix.
- Anything that restates an entry already in the target INSIGHTS.md — add an `extended` comment under it, or skip.

## Routing
- Fixed a repo-intel ranking bug → `server/INSIGHTS.md` (repo-intel is a server module)
- A contract change in `server/src/vendor/shared` broke the client build → root `INSIGHTS.md` (cross-package)
- Flaky `wait --text` in a flow → `e2e/INSIGHTS.md`

## Comments on an existing entry
```
- 2026-11-22 · Use `npm run e2e:hermetic`, not `npm test`, on a dev machine — flows 02/04/05 follow the home redirect to the first repo and fail when the dev DB has extra repos. Evidence: `e2e/README.md` (Precondition)
  - 2026-12-01 · extended: flow 06 fails the same way. Evidence: `e2e/specs/06-onboarding.flow.json`
  - 2026-12-15 · obsolete: home now redirects to the seeded repo by name, so flows pass on any DB. Evidence: `client/src/app/page.tsx`
```
Not worth a comment: `confirmed` for the same situation the entry already describes — it adds nothing.

## Dependency upgrade
Task bumped `fastify-type-provider-zod` in `server/package.json`; an entry says the error handler must match ZodError by shape. Re-check:
- still true → nothing (or `confirmed` if a new case showed it);
- no longer true → `  - 2026-12-10 · obsolete: after the upgrade a single zod instance is loaded; instanceof is enough. Evidence: \`server/package.json\``

## Conflict found while reading
```
- 2026-11-22 · Run server unit tests with `pnpm test:unit` — faster than the full suite. Evidence: …
- 2026-11-30 · Never rely on `pnpm test:unit`; package.json may be skip-worktree. Evidence: `TESTING.md`
```
Don't pick one. Check `server/package.json` → no `test:unit` script → comment under the first:
`  - 2026-12-02 · contradicted: no test:unit script in the committed package.json; use \`pnpm exec vitest run --exclude '**/*.it.test.ts'\`. Evidence: \`server/package.json\`` — and tell the user.

## Split into a domain file (after user approval)
```sh
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" init server/INSIGHTS-repo-intel.md "server / repo-intel"
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" add server/INSIGHTS-repo-intel.md Context "<same entry text>"
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" comment server/INSIGHTS.md "<entry text>" "2026-12-20 · moved: to server/INSIGHTS-repo-intel.md"
```
Then the user deletes the moved originals by hand.

## Review log entry
`- 2026-12-20 · reviewed: 64 entries, 5 flagged (3 obsolete, 2 contradicted), 12 moved to INSIGHTS-repo-intel.md`
