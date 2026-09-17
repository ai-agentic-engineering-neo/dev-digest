# Entry format reference

Read this when actually writing an entry. `SKILL.md` carries the loop; this
file carries the wording.

## Contents

- House style
- One worked example per section
- Vague vs useful
- Correcting an entry without deleting it
- Anti-bloat

## House style

Terse, declarative, written for a machine to act on. No preamble, no hedging,
no "it seems that".

- **Hard-wrap at ~79 columns.**
- **Backtick every path, identifier, command, and table name.**
- **Quote the actual error string**, not a paraphrase of it. `relation
  "reviews" does not exist` is searchable; "a database error" is not.
- **End with evidence** — a `path/to/file.ts:42`, a runnable command, or the
  grep that proves the claim. An entry with no evidence cannot be re-verified
  when it goes stale.
- **One entry, one idea.** Two findings are two entries.
- **Absolute dates**, never "last week" or "recently".

The compression to aim for:

```
DIRECT_DATABASE_URL with `?pool=true` breaks psql — the param is Prisma-only
Webhook returns 404 but the body holds valid data — don't check response.ok
```

Both are readable cold, in one pass, with no surrounding context.

## One worked example per section

### Decisions

Prose, because the rejected alternative is the point. This is the only section
that uses an `###` heading per entry.

```markdown
### 2026-09-16 — Grounding is mechanical, not a second model call

**What:** every finding is checked against the diff by string match before it
reaches the user; nothing is verified by asking the model again.
**Why:** a model asked to grade its own output agrees with itself, and the
check has to be cheap enough to run on every finding.
**Rejected:** an LLM-as-judge pass — it passed hallucinated line numbers that
the string match catches immediately.
```

### What Works

```markdown
- **2026-09-16** — Field order in a `completeStructured` zod schema is
  generation order: declaring `category` and `confidence` *after* `rule` and
  its evidence is what makes them informative, because the model has already
  written the thing it is classifying. `server/src/modules/conventions/prompt.ts`
```

### What Doesn't Work

The section people skip and the one that pays. A dead end nobody recorded gets
walked again in three weeks.

```markdown
- **2026-09-16** — A green `pnpm test` in `server/` does not mean the
  integration tests ran: `*.it.test.ts` self-skip when no Docker daemon is
  reachable, so a machine without Docker reports success having exercised none
  of the DB paths. `server/test/helpers/pg.ts:10`
```

### Codebase Patterns

```markdown
- **2026-09-16** — `modules/reviews/repository.ts` and
  `modules/reviews/repository/` are one design, not a leftover duplicate: the
  file is the facade, the directory holds query implementations split by
  aggregate. Add queries in the directory, keep the facade as the entry point.
  `server/src/modules/reviews/repository.ts:11`
```

### Tool & Library Notes

```markdown
- **2026-09-16** — Half this repo is pnpm and half is npm, so `pnpm install` in
  `reviewer-core/` or `e2e/` creates a second competing lockfile. Match the
  lockfile already in the directory, not the root README's pnpm prerequisite.
```

### Recurring Errors & Fixes

```markdown
- **2026-09-16** — `relation "…" does not exist` on a fresh clone means
  migrations were skipped. They never run on boot, by design.
  `cd server && pnpm db:migrate`
```

### Session Notes

One line per session that produced entries — enough to trace where a finding
came from, and nothing more. This is not a diary; a session that recorded
nothing gets no line.

```markdown
- **2026-09-16** — Wired the conventions extractor end to end; the two entries
  under *What Doesn't Work* above came from that work.
```

### Open Questions

```markdown
- **2026-09-16** — No route declares `schema.response`, so the zod serializer
  compiler wired at `server/src/app.ts:65` has nothing to compile. Unclear
  whether that is staged for a later lesson or simply missed.
```

## Vague vs useful

| ✗ | ✓ |
|---|---|
| "Promises can be tricky" | "`Promise.all()` over the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "checkout state always goes through the store, never local state — three components share the cart" |
| "the vendored copies can drift" | "`client/src/vendor/shared/` is a hand copy of `server/src/vendor/shared/` with no sync script; editing one alone desyncs the client from the API silently. `diff -rq server/src/vendor/shared client/src/vendor/shared`" |
| "watch out for migrations" | "adding `index()` to a Drizzle schema changes nothing until `pnpm db:generate` writes a migration and `pnpm db:migrate` applies it — the TypeScript and the database disagree silently until then" |
| "the test suite is slow" | *not an insight — this is a complaint. Either fix it or leave it out.* |

The rule underneath all five: **if it would be obvious to anyone reading the
code, don't write it.** An insight is something true about this code that is
not visible in it.

## Correcting an entry without deleting it

These files are append-only. An entry that turns out to be wrong, or that code
has since fixed, gets a dated note nested beneath it — never a silent edit and
never a deletion. The history is what stops the same wrong conclusion being
drawn twice.

```markdown
- **2026-08-05** — No package in this repo has ESLint, so the
  `// eslint-disable-next-line` comments in `client/src` suppress a rule that
  has never run. `client/src/lib/hooks/reviews.ts:212`
  - **2026-08-14** — Partly stale: `server/` now has `eslint` and a `lint`
    script but still no config file, so `pnpm lint` there fails rather than
    lints. The claim still holds for `client/`. `server/package.json:11`
```

Deletion is for pruning only — a bug since fixed, a duplicate, an entry that
has never once proved useful.

## Anti-bloat

- Don't attach a "warning signs" paragraph to an obvious rule.
- Don't show a bad example for a trivial mistake.
- Don't restate the claim in a closing sentence.
- Don't write a title where a claim belongs. "Fixed the SSE bug" carries no
  information; "the SSE stream closes on the first heartbeat because the proxy
  buffers `text/event-stream`" does.
