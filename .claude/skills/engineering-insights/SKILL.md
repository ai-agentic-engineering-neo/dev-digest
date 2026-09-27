---
name: engineering-insights
description: Reads and appends this project's INSIGHTS.md files — the per-package record of what a future session would otherwise have to rediscover. Use it twice per session. First, before the first edit in a package, to read that package's INSIGHTS.md in full. Second, when a non-obvious learning surfaces or a task is about to be reported complete, to append it: a dead end, a tool or library quirk, an error whose cause was not in the message, a convention discovered by reading code, an architectural decision worth its reasoning, or a question left open. Also use when the user says "capture this", "wrap up", "запиши інсайт", or invokes /engineering-insights.
allowed-tools: Read, Grep, Bash
---

# Engineering Insights

`INSIGHTS.md` is the evolving half of this project's memory; `AGENTS.md` is the stable
half. A fact that has bitten three times graduates to `AGENTS.md` — everything younger
lives here.

The skill runs in two modes. **Read** comes first and runs almost every session.
**Write** runs only when something was actually learned, which is less often.

See [examples.md](examples.md) for the rejected/accepted pairs behind every rule below.

## Which file

| What you are working on | File |
|---|---|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| `scripts/**`, `.github/**`, `.claude/**`, `docker-compose.yml`, root docs, or two or more packages | `INSIGHTS.md` (root) |

Tie-break: the package whose files you will **edit**, not the ones you read. `repo-intel`
is not a package — it lives in `server/src/modules/repo-intel/` and files under `server`.
A contract change that has to land in both `vendor/shared` copies is cross-cutting → root.

---

# Mode 1 — Read

**When:** after the user's prompt, before the first edit — and before any plan that
depends on how this code behaves.

1. Work out which package the request is about, from the table above. If the request
   names no package, or spans several, read the root `INSIGHTS.md`.
2. **Read that file in full.** All seven sections, not a grep — the entry that matters is
   usually the one you did not think to search for. The files are short by design.
3. Say, in one line, which entries bear on this task — or that none do. This is the only
   evidence that the file was read rather than skipped.

Treat `What Works`, `Codebase Patterns` and `Tool & Library Notes` as high-confidence
guidance. Avoid what is under `What Doesn't Work`. Check `Recurring Errors & Fixes`
before debugging anything — the answer may already be a lookup.

---

# Mode 2 — Write

**When:** the moment a surprise resolves and the fix is confirmed, and again before
reporting a task complete.

**Writing nothing is the normal outcome and requires no apology.** Most sessions produce
no insight. A padded file is worse than a thin one: a wrong or obvious entry propagates
into every future session until someone deletes it.

## Step 1 — the gate

Write the entry only if it passes **all four**:

1. **Recurrence** — would a developer forget this, or get it wrong a second time? The
   strongest signal: you had to ask the user, or go looking, to get past it.
2. **Invisibility** — it cannot be read off the code. If the answer sits in the file you
   just edited, the code already says it.
3. **Evidence, confirmed** — you can name a `file:line`, a command, or the exact error
   string, and the fix is verified. A guess that seemed to work is not an insight.
4. **Cold-actionable** — a reader who was not here knows what to do without
   re-investigating.

Not yet settled — behaviour you suspect but did not reproduce, code still in flux — is
not a failed insight. It goes to `Open Questions`, phrased as the observation that raised it.

Cap: **3 entries per task.** More than that means the bar dropped.

## Step 2 — check it is not already there

**Re-read the target file in full before writing, even if you read it in Mode 1** — you
now know what you are looking for, and an earlier session may have written this already.

- Already recorded and still true → **write nothing.** Say so and stop.
- Recorded but now wrong → append a correction as a *new* entry, newest-first, opening
  with `- **Corrected YYYY-MM-DD:** …` and restating what is true now. Never edit or
  delete the old entry; the history is the point.
- Overlaps an entry without repeating it → fold your detail into a new entry that stands
  on its own, rather than one that only makes sense next to its neighbour.

## Step 3 — pick the section

| Section | Holds |
|---|---|
| `What Works` | an approach that held up, plus the context that made it hold |
| `What Doesn't Work` | what was tried, why it failed, what to do instead |
| `Codebase Patterns` | a convention or architectural **decision** found here, with its reason |
| `Tool & Library Notes` | a dependency doing something its docs do not say |
| `Recurring Errors & Fixes` | symptom → cause → fix, so the next hit is a lookup |
| `Session Notes` | what was worked on and the state it was left in |
| `Open Questions` | unresolved behaviour, an undecided design, an unverified assumption |

`What Doesn't Work` is the highest-value section and the one most often left empty.
A dead end you burned an hour on is worth more than the fix that followed it.

## Step 4 — write the entry

```
- **<The claim, as one bold sentence.>** <One or two lines of detail carrying the evidence.>
  → <What to do instead, or what to do next time.>
```

Session Notes take a heading instead, with **today's real date** from `date +%F` — never
a guessed or copied one:

```
### YYYY-MM-DD — <topic>
<Two to four lines: what was worked on, what state it was left in.>
```

Terse and declarative. Never put a secret, a token, or an absolute path from outside the
repo into these files.

## Step 5 — append

The script is the only way this skill writes. It is append-only: it refuses a malformed
entry, an unknown section, an entry whose first line is already in the file, and any
rewrite that would drop an existing line.

```bash
printf '%s\n' \
  '- **Claim.** Detail with `src/platform/jobs.ts:42`.' \
  '  → Action.' \
| .claude/skills/engineering-insights/scripts/append-insight.sh \
    --module server --section "What Doesn't Work"
```

`--module` is one of `root`, `server`, `client`, `reviewer-core`, `e2e`; `--file <path>`
works too, and `--dry-run` prints the diff and writes nothing. When the script refuses,
fix the entry — never work around it by editing the file.

Then show the user the **exact text** that was appended and where, not a summary of it.

## Do not capture

- A restatement of the diff, or "fixed bug X" — that is the commit message.
- Anything already in a `AGENTS.md`, `README.md`, or `TESTING.md`.
- General truths about TypeScript, React, Fastify or Postgres — the model has those.
- A one-off that will not recur, or a note whose evidence is "it seemed to work".

When a section passes roughly 20 entries, consolidate it instead of appending: overlapping
half-true entries cost more than they return.
