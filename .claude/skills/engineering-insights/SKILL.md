---
name: engineering-insights
description: Captures non-obvious engineering insights into the touched module's INSIGHTS.md (client, server, reviewer-core, e2e). Use during a session the moment you hit something a future agent would otherwise relearn — a gotcha, a working approach, a dead-end antipattern, a codebase convention, a tool/library quirk, a recurring error+fix, or an open question — and again at session end, on "wrap up" / "retro", or when /engineering-insights is invoked. Reads the existing file first, never duplicates, writes only substantial file-grounded entries, and is strictly append-only (never overwrites).
---

# Engineering Insights

Capture one durable engineering insight into the **INSIGHTS.md of the module the
work touched**, so the next session doesn't relearn it. Read what's already
there, add only what's new and substantial, never overwrite.

## Where to write (module routing)

Write to the file of the package the work actually touched:

| Work touched | File |
|---|---|
| client (`@devdigest/web`) | `client/INSIGHTS.md` |
| server (`@devdigest/api`, incl. repo-intel) | `server/INSIGHTS.md` |
| reviewer-core (`@devdigest/reviewer-core`) | `reviewer-core/INSIGHTS.md` |
| e2e (`@devdigest/e2e`) | `e2e/INSIGHTS.md` |
| crosses package boundaries, or is repo-wide | `INSIGHTS.md` (root) |

Two rules of thumb: an insight that fits two modules is usually a **root**
insight, and shared contracts (`@devdigest/shared`) are always root — they exist
in two copies, so a finding about them is never local to one package.

If the target file doesn't exist yet, create it with the section template at the
bottom of this file.

## The bar

Most findings fail this. **Writing nothing is the normal outcome of a session** —
a file of filler costs every future session tokens and teaches nothing.

An entry must pass all three:

1. **Non-obvious** — if it would be clear to anyone who opened the file, don't
   write it. "`groundFindings` drops uncited findings" is obvious from the
   function. "The client's vendored contracts silently lag the server's" is not.
2. **Actionable cold** — a reader who never saw this conversation knows what to
   do. Not "be careful with the shared contracts" but "editing
   `client/src/vendor/shared/` alone desyncs the API — change the server copy first".
3. **File-grounded** — carries a `file:line`, a command, or an error string. No
   evidence means it's a hypothesis: it goes under **Open Questions**, not stated
   as fact.

Worked pairs:

| Noise | Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "checkout-flow state always goes through Zustand (`cartStore.ts`) — three components share the cart, local state doesn't hold" |
| "tests are split somehow" | "a DB-backed test not named `*.it.test.ts` runs in the unit lane and fails without Docker. Evidence: `TESTING.md:79`" |

The failing entries name a **topic** instead of stating a **fact**. If the
sentence would still be true in someone else's repo, it isn't an insight about
this one.

The root `INSIGHTS.md` is the worked example — read it before writing your first
entry.

## When to run

**During the session**, the moment something surfaces. One entry, written while
the context is loaded. Waiting until the end is where findings die.

**At session end** — on "wrap up" / "retro", or after any task that involved
debugging, investigation, or a design call. Review what happened, extract what
didn't get written down, dedupe against the file, append. Skip entirely for
routine work.

## Sections

Fixed. Add to the one that fits; never invent a heading.

| Section | Holds |
|---|---|
| What Works | approaches that held up |
| What Doesn't Work | dead ends and antipatterns, with the reason they break |
| Codebase Patterns | conventions and architectural decisions |
| Tool & Library Notes | dependency quirks, version traps, tooling behaviour |
| Recurring Errors & Fixes | a mistake made more than once, plus its fix |
| Session Notes | dated one-liners; a pointer, never a transcript |
| Open Questions | noticed, not proven |

**What Doesn't Work is the section people skip and the one that pays.** A dead
end you don't record is a dead end the next session walks into.

## Entry format

```markdown
- **2026-07-29** — Claim in one sentence, specific enough to act on. Evidence: `path/to/file.ts:42`.
```

Get the date from `date +%F` — do not guess it.

Append at the end of the section. **The claim is always one sentence.** It may be
followed by an indented list or compact table when that enumerates instances of
the same fact. It may not be followed by explanatory prose — if the entry needs
prose to make its case, it's documentation: put it in the module's `README.md`
and leave a one-line pointer here.

## Append-only

Read the target section before writing. Then:

- **Same fact already there** → don't append. If the existing entry is vaguer
  than what you now know, add a dated line beneath it that sharpens it.
- **Same area, different fact** → separate entry. Never fold two facts into one
  sentence; each needs its own evidence.
- **Entry turned out wrong or stale** → leave it, add a dated correction indented
  beneath it:

```markdown
- **2026-06-02** — Repo Intel is off unless `REPO_INTEL_ENABLED=true`. Evidence: `server/src/platform/config.ts:31`.
  - **2026-07-29** — No longer true: the default flipped to on. Evidence: `server/README.md:98`.
```

Never delete to resolve a contradiction. The history of what was believed shows
which assumptions this codebase invites, and an append is one line to review in
the diff where a rewrite is a diff nobody checks.

## Never record

- Anything the diff already says, or that `git log` answers.
- Task status, todo lists, or what you did this session. That's a transcript.
- Restated `README.md` / `CLAUDE.md` content. Link instead.
- Secrets, tokens, or absolute paths from a personal machine.
- Speculation dressed as fact. Open Questions or nowhere.

## New-file template

```markdown
# <module> — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
```

## Maintenance

A file past **~200 entries** has a signal problem — prune or split by domain.
Delete entries whose subject no longer exists, drop Session Notes older than a
quarter, and promote anything that has held for months into the module's
`README.md`. These files are a **draft under review**, committed to git so a
human sees them in the diff — not a source of truth.
