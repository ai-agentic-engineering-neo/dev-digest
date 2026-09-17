---
name: engineering-insights
description: "Records durable engineering findings into the repo's INSIGHTS.md files — non-obvious behaviour, approaches that failed, and decisions with their rationale — routed to the package the finding belongs to. Use mid-session the moment something surprises you, costs a second attempt, or settles a design question, and again as an end-of-session wrap-up for any session that involved a problem, a decision, or a discovery."
---

# Engineering Insights

Append what this session learned to the repo's `INSIGHTS.md` files, so the next session starts where this one ended. One bullet per finding, routed to the package it belongs to, append-only.

Sections are fixed and the format is fixed. Never invent a heading, never delete one, never rewrite an existing entry.

---

## Two triggers

| Trigger | When | What it does |
|---------|------|--------------|
| **Capture** | Mid-session, the moment a finding appears | Write that one entry immediately. Don't batch it — an entry held in context is an entry lost to a compaction. |
| **Wrap-up** | Before finishing any session that involved a problem, a decision, or a discovery | Run the full procedure below. Re-read the target file from disk first, so anything already captured dedupes naturally. |

Skip the wrap-up only for pure trivia: a typo, a rename, a one-line copy change, a question answered without opening code. When in doubt, run it.

---

## What counts

Record a finding when it is **true about this code and not visible in it**:

- Behaviour that contradicts what the code looks like it does.
- An approach that was tried and failed, and why it fails.
- A constraint the codebase silently depends on — an ordering, a filename, a platform.
- A dependency behaving unlike its docs.
- A decision, with the rationale that isn't in the diff.

Everything else is noise. Most sessions yield **0–3 entries**. More than five means the filter is too loose.

---

## The banality test

Three questions per candidate. One "no" kills it.

1. **Would this be obvious to a competent engineer reading the file it points at?** If yes, don't write it.
2. **Could someone act on it cold**, with no memory of this session?
3. **Does it name something specific** — a symbol, file, command, env var, error string, or number?

| Banal | Useful |
|-------|--------|
| "Windows path handling can be tricky in the CLI entrypoints." | "Comparing `import.meta.url` to `process.argv[1]` as strings never matches on Windows, where argv is backslash-separated and can never equal a `file://` URL — the entrypoints compare resolved native paths instead, and reverting silently breaks `pnpm db:migrate` on Windows only." |
| "`container.embedder()` throws when embeddings are disabled." *(the code already says this)* | "`container.embedder()` throwing is the designed path when `EMBEDDINGS_ENABLED` is false — it throws before constructing any OpenAI client, so callers must try/catch and degrade rather than treat it as an error." |
| "Be careful with test file naming in the server." | "A DB-backed server test not named `*.it.test.ts` runs in the unit lane and fails there without Docker; the split is by filename, not by content." |
| "SSE connections need care." | "`RunBus` keeps a run's event buffer after completion so a late subscriber can replay it, but the buffer is in-memory only: after a restart the same events must be read from `run_traces`." |

The pattern: the banal version is a **topic**; the useful version is a **claim with a consequence**.

---

## Routing

| The finding is about | File |
|----------------------|------|
| `server/**` — API, Drizzle, jobs, `repo-intel` | `server/INSIGHTS.md` |
| `client/**` — Next.js, React, vendored UI | `client/INSIGHTS.md` |
| `reviewer-core/**` — the engine | `reviewer-core/INSIGHTS.md` |
| `e2e/**` — flows, agent-browser, the run harness | `e2e/INSIGHTS.md` |
| Two or more packages · `@devdigest/shared` (either copy) · `scripts/` · `docker-compose.yml` · `.claude/` · `skills-lock.json` · root `docs/`, `specs/`, `TESTING.md` | `INSIGHTS.md` (root) |

**Tie-breaker: file it where someone will be standing when they hit it again, not where the offending code lives.** `e2e/INSIGHTS.md` already holds an entry whose evidence is `client/src/vendor/ui/shell/AppFrame.tsx:29` — the inner-scroll rule bites you while running flows, so it lives with the flows. Use the root file only when the finding is about the *relationship* between packages.

One finding goes in exactly one file. Never copy a bullet into two.

---

## Choosing the section

| The finding is… | Section |
|-----------------|---------|
| A design that holds, whose load-bearing role is invisible — *this is why it works* | `## What Works` |
| Something that looks right and isn't: a trap, a footgun, a failed or rejected approach | `## What Doesn't Work` |
| A convention or invariant this codebase relies on — *do it this way here* | `## Codebase Patterns` |
| Behaviour of a dependency or CLI: vitest, Fastify, Drizzle, tiktoken, agent-browser, the OpenAI SDK | `## Tool & Library Notes` |
| An error message seen more than once, with its real cause and the fix | `## Recurring Errors & Fixes` |
| A change big enough that the next session needs entry points into it | `## Session Notes` |
| Unknown intent, drift of unclear origin, a deferred call — anything unverified | `## Open Questions` |

`## What Doesn't Work` is the section most often skipped and the most valuable. If a candidate is "X doesn't work", it goes there even when you also learned what does — that's two bullets, not one.

`## Session Notes` is **not** a per-session journal. Write one only when the session changed the *shape* of the repo: a new module, a new package-level convention, files moved or split, a doc restructure. Roughly one entry per ten sessions; empty is the correct steady state.

### Decisions

There is no `## Decisions` heading and you may not add one. Split the decision across the sections that exist:

| Part of the decision | Section |
|----------------------|---------|
| The rule that now binds future code — *X is injected, never tabled in the engine* | `## Codebase Patterns` |
| Why the chosen design is load-bearing, when that isn't visible | `## What Works` |
| The alternative that was tried or considered, and why it fails | `## What Doesn't Work` |
| A call deliberately deferred | `## Open Questions` |

A decision normally produces **one** bullet (Codebase Patterns or What Works) plus, when a real alternative was rejected, **one** in What Doesn't Work. Never pack both halves into a single bullet.

---

## Entry format

```
- **YYYY-MM-DD** — One paragraph: what is true, why it isn't visible in the code, and what a future session must do about it. Evidence: `path/to/file.ts:LINE`.
```

| Rule | Detail |
|------|--------|
| Date | Bold ISO, today's date from the environment. Never guess it, never backdate. |
| Separator | Em dash `—` after the date. |
| Body | One paragraph. No sub-bullets, no code fences, no headings, no line breaks inside the bullet. |
| Evidence | Trailing `Evidence:` with backticked repo-root-relative `path:line` or `path:line-line`; several refs comma-separated. **Root-relative even inside a package file** — `server/src/db/migrate.ts:38-40`, not `src/db/migrate.ts:38-40`. |
| Spacing | One blank line between bullets. |
| `## Session Notes` | Ends with `Entry points:` and markdown links (relative to the file being written) instead of `Evidence:`. |
| `## Open Questions` | No trailing clause at all. |
| Empty sections | Keep the bare heading. Never delete it, never add a placeholder. |

---

## Duplicates, conflicts, corrections

Before appending, grep the target file for the finding's distinguishing noun — the symbol, filename, env var, command, or error string.

| You find | Do |
|----------|-----|
| The same fact, already recorded | Don't append. If your evidence is sharper, add a correction note instead. |
| The same subject, a different facet | Append a new bullet, and make its first clause state the new thing. |
| A bullet your session proved wrong | Never edit it away. Append a correction note beneath it. |
| Four or more bullets about one file in one section | Stop and tell the user; offer to consolidate. Don't consolidate unasked. |

Correction notes are the one place a nested bullet is allowed — indented directly under the entry they correct:

```
- **2026-09-16** — Boot-time reaping marks every `running` agent_run stale, so a second API instance against the same database kills the first one's in-flight runs. Evidence: `server/src/app.ts:78`.
  - **2026-11-02** — Superseded: reaping now filters by instance id; a second instance no longer kills in-flight runs. Evidence: `server/src/app.ts:78-84`.
```

Three prefixes only: **`Superseded:`** (no longer true) · **`Narrowed:`** (still true, but only under stated conditions) · **`Confirmed:`** (hit again; the second date is the point).

---

## Wrap-up procedure

1. **Decide whether to run.** Did this session involve a problem, a decision, or a discovery? If yes, continue.
2. **Scan the session for candidates.** Walk back through it for: anything that took more than one attempt · every error message and its real cause · anything that surprised you · every approach tried and abandoned · every rule you inferred and then followed. Collect the raw list first — don't filter while scanning.
3. **Apply the banality test** to each candidate. Expect to drop most of them.
4. **Route each survivor** with the routing table. One file each.
5. **Pick the section** with the section table. Split decisions per the Decisions table.
6. **Verify the evidence.** Open the file and read the lines you are about to cite. The claim must be checkable *at that line*. If the line moved, use the number you just read; if no single place shows it, cite the two that do; if nothing does, drop the entry. Never cite a file you haven't opened.
7. **Check for duplicates** in the target file per the table above.
8. **Append.** Under the chosen heading, after its last existing bullet, one blank line before. Never reorder, reflow, or touch another entry.
9. **Report to the user** — one line per entry: file, section, first clause. This is a draft for review, not a commit. If the user disagrees with an entry, remove it; don't defend it.
10. **Hygiene check.** If a file has passed roughly 200 bullets, or a single section has passed 60, say so and offer a consolidation pass. Stale entries are worse than missing ones.

---

## Never record

- **Anything already in `CLAUDE.md`, `README.md`, `docs/`, `specs/`, or `TESTING.md`.** Sharpening an existing warning into a checkable `file:line` claim with a rule of action is fine; restating it is not.
- **Anything git already holds** — what you changed, which files you touched, the commit message. `INSIGHTS.md` answers *why* and *what bit us*, never *what happened*.
- **Session trivia** — what the user asked, what you planned, how long it took, which tool you used, how many tests passed.
- **Generic engineering advice** that would be true in any repo.
- **Anything unverified.** It goes in `## Open Questions` phrased as a question, or nowhere.
- **Secrets, tokens, absolute local paths, machine details.**
