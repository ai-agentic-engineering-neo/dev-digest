# Rubrics for insights.md entries

Every entry lives in exactly one of the 7 sections below. Pick the most specific one — if two fit, prefer the more concrete (What Doesn't Work > Tool & Library Notes > Session Notes).

The universal quality test applies to every entry:

> If this were obvious to anyone reading the code, don't write it.

## 1. What Works

A non-obvious approach that succeeded — something a future agent should reach for by default in this module. Requires a reason.

**Good:**
> "Streaming review traces to the client via SSE (`server/src/platform/sse.ts`) instead of polling — survives long LLM calls (>2 min) without client-side timeout retries, and lets the UI show token-by-token progress. Trade-off: one HTTP connection stays open per active run."

**Bad:**
> "Streaming is good."

## 2. What Doesn't Work

Antipatterns, dead ends, approaches that fail in a non-obvious way. This section is the most often skipped and the most valuable — a future agent won't repeat the experiment.

**Good:**
> "`Promise.all` on per-file review of a 500+ file PR OOMs the server process (heap hits 4 GB). Use `p-limit` with concurrency 10 instead (see `server/src/modules/reviews/run-executor.ts`)."

**Bad:**
> "async code can be tricky"
> "be careful with batching"

## 3. Codebase Patterns

Project-specific conventions that aren't obvious from skimming code — the kind of thing a new contributor would do wrong before someone corrects them.

**Good:**
> "All route handlers get their dependencies through `app.container` (Fastify decorator in `server/src/platform/container.ts`), never direct imports of adapters. This keeps tests hermetic: integration tests swap mocks via `ContainerOverrides`."

**Bad:**
> "We use dependency injection."

## 4. Tool & Library Notes

Quirks of a dependency not documented in its own docs, or divergences from its defaults.

**Good:**
> "Drizzle `.returning()` on INSERT does NOT include Postgres-side generated columns until drizzle-orm 0.30 — before that, we re-SELECT by id after insert in `server/src/db/repos/*`."

> "`fastify-type-provider-zod` validates and serializes with the same Zod schema, but response serialization silently drops unknown keys even when the schema is `.passthrough()` — on purpose, don't fight it."

**Bad:**
> "Fastify is fast."
> "ORMs have gotchas."

## 5. Recurring Errors & Fixes

An error message or symptom that has appeared more than once, paired with a stable fix. If it's happened only once, it belongs in Session Notes instead.

**Good:**
> "Error: `ECONNREFUSED 127.0.0.1:5432` in `*.it.test.ts` → Docker daemon isn't running. Tests self-skip, but CI logs make it look like a failure; fix is `docker compose up -d` before `pnpm test`."

**Bad:**
> "DB connection errors happen sometimes."

## 6. Session Notes

Datestamped summary of a meaningful session — use when the finding is specific to that session's work but still worth preserving (why a decision was made, what was tried). Short, chronological.

**Good:**
> "**2026-11-22** — Tried moving `run-executor` to a worker thread to unblock the event loop during long reviews. Rolled back: `node:sqlite3` and the pgvector pool don't cross the postMessage boundary cleanly. Kept the chunked `p-limit` approach."

**Bad:**
> "**2026-11-22** — worked on reviews"

## 7. Open Questions

Something unresolved — a design uncertainty, a suspicious piece of code, a flaky test, a dependency you're not sure about. Future sessions pick these up.

**Good:**
> "Why does `grounding.ts::groundFindings()` sometimes drop findings on a valid diff line when the hunk header is malformed? Reproduced on PR #182 but not minimized. Workaround: regenerate the diff via `git diff --no-prefix`."

**Bad:**
> "Grounding is confusing."

---

## Section choice at a glance

| If the entry is… | Put it in |
|---|---|
| "X works because Y" | What Works |
| "X fails / don't do X" | What Doesn't Work |
| "In this repo we always do X" | Codebase Patterns |
| "Library/tool X behaves weirdly here" | Tool & Library Notes |
| "Error X ↔ fix Y" (seen 2+ times) | Recurring Errors & Fixes |
| "On date D we tried X" | Session Notes |
| "Not sure why X" / "Should we Y?" | Open Questions |
