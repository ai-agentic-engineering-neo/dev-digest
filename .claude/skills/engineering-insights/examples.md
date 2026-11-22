# Examples

Test: if it would be obvious to anyone reading the code, don't write it.

## Per section (❌ vs ✅)

**What Works**
- ❌ Using TypeScript helped catch bugs
- ✅ 2026-11-19 — Run the grounding gate on a fixture diff before touching prompts — it fails fast without an LLM (`reviewer-core/src/grounding.ts`)
- Why: names the step, the benefit and the place.

**What Doesn't Work**
- ❌ Editing the shims didn't work
- ✅ 2026-11-19 — Editing `server/src/platform/{grounding,prompt,structured}.ts` has no effect on logic — they re-export reviewer-core; change it there
- Why: states the dead end and the correct place.

**Codebase Patterns**
- ❌ Contracts are in shared
- ✅ 2026-11-19 — `vendor/shared` is duplicated in server and client and has drifted — diff both before editing a contract
- Why: actionable before the edit, not after.

**Tool & Library Notes**
- ❌ pnpm is used
- ✅ 2026-11-19 — reviewer-core has only an npm lockfile (server/client use pnpm); `build` is a type-check and emits nothing
- Why: prevents running the wrong package manager.

**Recurring Errors & Fixes**
- ❌ DB errors sometimes happen
- ✅ 2026-11-19 — `relation "…" does not exist` on server start — migrations don't run on boot — run `cd server && pnpm db:migrate`
- Why: exact symptom → cause → command.

**Session Notes**
- ❌ Worked on server stuff
- ✅ `### 2026-11-19 — add repo import route` · added 1 Tool note, 1 Open Question
- Why: dated, says what was captured.

**Open Questions**
- ❌ - [ ] Is the schema right?
- ✅ - [ ] 2026-11-19 — Does `repo-intel` facade cache embeddings across re-index? — look at `server/src/modules/repo-intel`
- Why: pointed, with a place to start.

## From the research slide

- ❌ "обережно з async"
- ✅ `Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` in batches of 10
- ✅ Checkout state always via Zustand (`cartStore.ts`) — 3 components share the cart; local state doesn't work here

## Line numbers (bad)

- ❌ Fixed a bug on line 47 of parser.ts
- ✅ `parseDiff` drops the last hunk when the diff has no trailing newline — normalise input first (`reviewer-core/src/diff.ts` · `parseDiff`)
- Why: line numbers drift; path + symbol survive.

## Duplicate → skip

Session rediscovers that migrations don't run on boot. `server/INSIGHTS.md` already says so.
→ Don't add. Report: `Skipped: migrations not on boot (already documented)`

## Extend an existing entry

Existing: "`server/docker-compose.yml` publishes 5432 on all interfaces."
New fact: the root compose is loopback-only and `dev.sh` uses it.
→ Extend the existing line in place; don't add a second entry.
