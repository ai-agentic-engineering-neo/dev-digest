# Examples: real entries from the sources

The examples are taken from the sources (quoted or lightly trimmed), not invented. They come from other projects:
copy their *shape*, not their content. Sources are listed in `references/sources.md`.

## Calibration: noise vs insight

| ❌ Noise | ✅ Insight | Source |
|---|---|---|
| "Promises can be tricky." | "`Promise.all()` on the ingestion pipeline times out after 30 items — switch to `Promise.allSettled()` with batches of 10 for that module." | MindStudio, wrap-up guide |
| "Be careful with async." | "Checkout state always goes through Zustand (`cartStore.ts`), because 3 components share the cart; local state does not work here." | MindStudio, wrap-up guide (slide 2) |
| "Be careful with the database layer." | "Avoid relative imports in /utils — the build step resolves them incorrectly." | MindStudio, Learnings.md per skill |
| "Fixed a bug on line 47 of parser.py." | "bats-core `run` captures exit code but swallows stderr — use `2>&1` to capture both." | shipyard `lessons-learned` skill |
| "Be careful with value classes." / "MockK is hard." | "A Kotlin `@JvmInline value class` can't be mocked with MockK — use real instances in tests." | xtone `lessons` skill (translated) |

What makes the right column work: a concrete name, the observed behaviour, the rule, and (often) the reason.
The left column has at least one of these problems: it is vague, it carries no rule, or it points to a line number that will rot.

## One-liners from a real Learnings section (evoleinik, ~3 months of use)

Shape to copy: imperative, one line, no context needed.

- `vercel link` overwrites `.env.local` — restore from git after
- `DIRECT_DATABASE_URL` with `?pool=true` breaks psql — the param is Prisma-only
- Webhook returns 404 status but the body contains valid data — don't check `response.ok`
- Prisma Accelerate has a 5MB response limit — use `select`, not `include`
- Run `npm run build` before committing — it catches type errors CI would reject

## Generalize one level (Aviad Rozenhek)

The mistake was patching the logger to fix one caller.
❌ Too narrow: "Don't patch the logger." ✅ Generalized: "Don't patch widely-used infrastructure for one caller — wrap or fix at the call site."
The generalized rule still names the concrete case that triggered it.

## This repo, in our format

```
- 2026-11-21 · A failed fire-and-forget job crashed the API (unhandled rejection) ·
  JobRunner marks `done` as handled; callers that need the result must `await done`. · `server/src/platform/jobs.ts`
```

Note: the evidence is a path, not a line number.

## Never an insight

- A replay of the chat ("first I tried X, then Y…"). Write the conclusion instead.
- Anything already in CLAUDE.md, README or `docs/`.
- Generic advice that is true in every codebase.
- Temporary state ("my local DB is empty right now").
- "Nothing new, but here's a summary." Writing nothing is the correct output.
