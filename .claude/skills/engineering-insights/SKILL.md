---
name: engineering-insights
description: >-
  Reads and records DevDigest's engineering insights. Reads the INSIGHTS.md of
  the module a task concerns before the work starts, and records what was
  learned back into that same file when the task ends. Covers which module a
  finding belongs to, which of the eight fixed sections it goes in, the entry
  format, and the specificity bar an entry must clear.
when_to_use: >-
  At the start of any task that touches code, and at the end of any task in
  which something non-obvious happened: a user correction, an approach that
  failed, repeated friction, a convention found only by reading code, or a
  dependency quirk. Also on "wrap up", "what did we learn", "record this",
  "insights", "retro", "lesson learned".
allowed-tools: Read, Grep, Glob, Edit
---

# engineering-insights

A two-half loop over the `INSIGHTS.md` files: **read** at the start of a task,
**record** at the end. Insights are module-local by design — a session working
in `client/` reads `client/INSIGHTS.md`, not all five. Knowledge lives next to
the code it is about.

## Step 1 — Read before you work

1. Resolve the module from the request using the table below.
2. Read that `INSIGHTS.md` in full. The files are capped and short — read them,
   do not grep them.
3. Read the root `INSIGHTS.md` as well when the work spans two or more packages.
4. **Say in one line which file you read and whether it was relevant.**

```
Read server/INSIGHTS.md — nothing on SSE.
```

That sentence is not decoration. A silent read gets skipped, and the line is
also the only signal that the file loaded at all.

If a file already answers the question, cite it instead of re-deriving the
answer from source.

## Which file

| The work touches | File |
|---|---|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**`, `scripts/e2e.sh` | `e2e/INSIGHTS.md` |
| `scripts/`, `.github/`, `docker-compose.yml`, root docs, or **two or more packages** | `INSIGHTS.md` (root) |

Three cases that get misfiled:

- **`server/src/vendor/shared/` → root.** That is `@devdigest/shared`, which
  exists in two physical copies; a contract change there reaches every package,
  so it is never server-local.
- **`server/src/modules/repo-intel/` → `server/`.** A folder inside
  `@devdigest/api`, not a package of its own.
- **A finding about the workflow itself** (CI, `dev.sh`, pnpm vs npm) → root.

## Step 2 — Record when the task ends

### 2a. Gate — is there anything to record?

A typo, a rename, a feature that went exactly as expected → **write nothing,
say "nothing worth recording", stop.** Recording noise is worse than recording
nothing: a file full of platitudes stops being read within two weeks.

If something non-obvious did happen, rank the candidates, highest signal first:

1. **User corrections** — an explicit "no, do it this way". The repo was wrong,
   or the agent's default was. Highest signal there is.
2. **Approaches that failed** — what was tried, abandoned, and why.
3. **Repeated friction** — the same error or workaround hit more than once.
4. **Conventions found by reading code** — what `CLAUDE.md` does not say.
5. **Dependency and toolchain quirks.**

**Cap: 3 entries per session.** If everything looks worth writing, the bar is
being applied too loosely.

### 2b. Write

For each surviving candidate:

1. **Read the target file** before writing to it.
2. **Check for a duplicate** — `grep -i '<key identifier>' <module>/INSIGHTS.md`.
   A near-duplicate means **sharpen the existing entry** — tighten the claim,
   update the date, add the evidence — not append a second copy.
3. **Append under the right section**, newest first within that section.
4. If a candidate contradicts an existing entry, correct the old one. Never
   leave both standing.

Never delete an entry that still holds. When code fixes what an entry warns
about, mark it rather than removing it:

```markdown
- **2026-07-31** — … original claim … **Fixed 2026-08-14 in `server/src/…`.**
```

### 2c. Report

One line per action, then stop. No trailing commentary.

```
server/INSIGHTS.md — added under What Doesn't Work: migrations never run on boot
Skipped: SSE reconnect note (already covered by the 2026-08-02 entry)
```

## Capture as you go

Do not save everything for the end. The moment a user correction lands or an
approach is abandoned, write it. Long sessions get compacted, interrupted, or
closed, and a wrap-up that never runs teaches nothing. End of task is the
backstop, not the only trigger.

## Which section

| Section | What belongs there |
|---|---|
| `Decisions` | A choice made, with the alternative that was rejected |
| `What Works` | An approach that solved something and should be reused |
| `What Doesn't Work` | A dead end — the section most often skipped and the most valuable |
| `Codebase Patterns` | A convention you had to discover by reading the code |
| `Tool & Library Notes` | A quirk of a dependency, CLI, or the toolchain |
| `Recurring Errors & Fixes` | A symptom you will hit again, and its cause |
| `Session Notes` | One dated line per session that produced entries |
| `Open Questions` | Something left unresolved, so the next session knows |

Sections are fixed. Never invent a new heading.

## Entry format

Claim first, evidence last:

```markdown
- **2026-09-16** — `pnpm test` in `server/` passes without exercising a single
  DB path: `*.it.test.ts` self-skip when no Docker daemon is reachable.
  `server/test/helpers/pg.ts:10`
```

`Decisions` is the one exception and takes prose:

```markdown
### 2026-09-16 — Mechanical grounding gate, not a trusted model

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what was tried, and how it failed.
```

Full house style, a worked example per section, and the correction pattern:
[reference/entry-format.md](reference/entry-format.md).

## The bar

An entry must be actionable **cold** — the next session reads it and knows what
to do without re-deriving anything.

| ✗ Noise | ✓ Insight |
|---|---|
| "be careful with migrations" | "`relation … does not exist` on a fresh clone means migrations were skipped — they never run on boot. `cd server && pnpm db:migrate`" |
| "tests can be flaky" | "a green `pnpm test` does not mean the integration tests ran — `*.it.test.ts` self-skip without a Docker daemon" |
| "Promises can be tricky" | "`Promise.all()` over the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10" |

**The test: if it would be obvious to anyone reading the code, don't write it.**
Generic advice is the failure mode — "use async carefully" is true everywhere
and therefore useful nowhere.

## Keeping the files lean

- Roughly **5 entries per section**, hard ceiling **~40 per file**.
- Delete an entry that (a) describes a bug since fixed, (b) duplicates another,
  or (c) has never once proved useful.
- When an entry hardens into a standing rule, **promote it**: one line in
  `CLAUDE.md` phrased as `NEVER …` / `ALWAYS …` with the reason, then delete it
  here. Bulky reference material goes to `<module>/docs/` instead. Different
  genres — `INSIGHTS.md` holds an observation with evidence, `CLAUDE.md` holds
  a rule.
- A stale entry is worse than no entry. Correct it or mark it.

## Anti-patterns

- Writing an entry because the session was long, not because something was
  learned.
- A label instead of a claim — "fixed the SSE bug" tells the next session
  nothing. Write what is now known.
- Filing everything under `What Works`.
- Recording what `CLAUDE.md`, `README.md`, or `docs/` already says.
- **Using this as a crutch for bad tooling.** If the agent keeps forgetting how
  to run the tests, fix the command, don't add a fifth entry about it.

## What this skill does not do

It captures insights only. It does not review code, write documentation, update
`specs/`, or run tests. `INSIGHTS.md` is not a session diary — it holds durable
findings, not a record of what happened.
