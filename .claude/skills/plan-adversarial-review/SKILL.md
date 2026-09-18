---
name: plan-adversarial-review
description: Adversarially re-verifies a drafted implementation plan against the live codebase before any code is written — re-reading every file and line the plan cites, cross-checking it against the project's own conventions, against the available language/framework/testing/security skills, and against the existing tests the plan would touch — then reporting prioritized "must fix before implementation" vs "worth flagging" findings, each with file:line evidence. Use on an explicit ask ("review this plan", "adversarially review my plan", "poke holes in this plan", "/plan-adversarial-review"), and proactively offer it whenever a large, multi-file, or cross-package plan is about to be implemented without any independent verification pass. Skip it for trivial single-file plans. Produces a review report only — never edits the plan and never implements it.
---

# Adversarial plan review

A plan is a set of claims about a codebase — "this component takes these
props", "this is purely additive", "no existing test covers this". The pass
that wrote the plan cannot check those claims fairly: it already believes
them, and the exploration output it trusted was written by the same reasoning
process. Bugs that survive planning are rarely carelessness — they are the
blind spots of a single pass.

This skill is the second, differently-primed pass. Its whole value is that it
re-derives the facts from the live source instead of re-reading the plan's
prose. A review that paraphrases the plan back with a confident tone is worse
than no review: it manufactures false confidence.

**Run this before implementation starts, not after.** Its output is a review
report handed back to whoever owns the plan. This skill does not implement
anything and does not rewrite the plan file — editing the plan is the
coordinator's call, informed by the report.

## Use a different (ideally stronger) model than the one that planned

The independence is the product. If the plan came from a fast or mid-tier
model, or from a subagent in this same session, running the review on a
stronger model (or at minimum a fresh agent with no memory of the planning
discussion) is what makes the pass catch anything. Re-running the same model in
the same context mostly reproduces the same blind spots. If you can't choose
the model, still run the review — and record whichever model actually ran it in
the report header's **Review model** field, so a reader who sees it matches the
planner's model can calibrate accordingly.

## Step 0 — gather inputs

Before reading anything else, make sure you have:

1. **The plan** — a file path (preferred) or inline text. If neither was
   given, ask: "Which plan file should I review?" Don't guess at a plan from
   conversation fragments; a partial plan produces a misleading review. If a
   path *was* given but the file doesn't exist or is empty, don't reconstruct
   the plan from conversation fragments either — report that the plan file
   couldn't be read (path, and whether it was missing or empty) and stop.
2. **Scope** (optional) — the user may want only part of it ("just the
   backend steps", "only the migration"). If they gave no scope, review all of
   it, but say in the report what you covered.
3. **What produced the plan** (optional but useful) — plan mode, an
   Explore+Plan agent chain, a human. It tells you which claims are
   second-hand and therefore most worth re-checking.

**When to decline.** If the plan touches a single file and a handful of lines,
say so and skip the full procedure — the ceremony costs more than it catches.
Offer a quick sanity read instead. The procedure earns its cost on plans that
are large, span multiple files or packages, or crossed an agent boundary (one
agent explored, another planned) where facts got summarized in transit.

## Step 1 — read the plan in full, first

Read the entire plan before opening a single source file. You need the whole
shape to spot the contradictions between step 3 and step 11, and to know which
claims are load-bearing. Note as you read:

- Every concrete claim about existing code (file paths, line numbers, function
  and prop names, "X currently does Y").
- Every claim about what is *not* there ("nothing else calls this", "no test
  covers this", "purely additive").
- Every judgment call phrased as already settled (see Step 6).

## Step 2 — re-verify every factual claim against the live source

Treat every claim as unverified, *including* claims the plan attributes to an
earlier "verified" exploration pass. That provenance is exactly what makes
them dangerous: they read as checked, so nobody checks them.

Open the real files at the cited line numbers. Line references drift; a plan
citing `src/foo.ts:142` written against an older tree may now point somewhere
else. For each claim, land on one of:

- **Confirmed** — name the file:line you actually read.
- **Wrong** — state what the source actually says, with file:line.
- **Unverifiable** — the cited path/symbol doesn't exist. That's a finding,
  not a shrug.

Restating a plan's claim in your own words is not verification. If you did not
open the file, you do not know.

## Step 3 — cross-check against the project's own documented rules

Plans contradict project conventions silently, because conventions live in
prose the planner skimmed. Read what applies to the touched area:

- **Agent/convention files** — root and per-package `CLAUDE.md` / `AGENTS.md`:
  stack, structure, naming policy, and especially **do-not-touch** rules
  (generated files, vendored copies, applied migrations, lockfiles). A plan
  step that edits one of those is a must-fix on its own.
- **`docs/`, `specs/`** — prior decisions and explicit acceptance criteria a
  plan can quietly contradict or under-deliver against.
- **`INSIGHTS.md` / running notes** — this is where a project records the
  gotcha it already paid for once. Plans re-introduce those bugs regularly.
  Search these for the components, libraries, and interactions the plan
  touches; if a note describes the exact failure mode the plan is walking
  into, cite it.
- **`README.md`, `TESTING.md`, contributing guides** — how things are meant to
  be run, built, and tested.

Grep these for the specific symbols and concepts in the plan rather than
skim-reading them; you are looking for a collision, not a summary.

## Step 4 — cross-check against the available skills

List the skills available in this session and pick the ones matching the
languages, frameworks, libraries, and concerns the plan touches (framework
best-practices, testing-library, ORM, database design, typing, security).
Then **actually apply their guidance to the plan's specific content** — quote
the rule and point at the plan step that violates it.

Naming a skill without applying it ("this should follow React best practices")
is filler and will be read as padding. If a skill's guidance turns out not to
bear on this plan, say nothing about it.

## Step 5 — read the tests, not just the source

Test breakage is the most common thing a plan misses, because the planner
reasons about the change and not about who was watching the old behavior.

Open every test file that the plan proposes to extend, plus every test file
covering code the plan modifies (find them by grepping for the changed
symbols, not by guessing filenames). For each, check:

- **Fit** — do the plan's proposed new cases match the file's existing
  structure, mocking style, and helpers? A plan that invents a new mocking
  approach mid-file is a review finding.
- **Breakage** — will an *existing* test fail under the proposed change
  (changed props, changed rendered text, changed query shape, changed
  fixture)? Name the test by its title and file:line.
- **Duplication** — is this coverage already asserted somewhere else? Adding
  a third copy of the same assertion is cost without signal.
- **Tier** — does the proposed test sit in the right layer per the project's
  own testing conventions (unit vs. integration vs. end-to-end)? A
  database-backed or network-backed case dropped into a pure unit file will
  fail or be silently skipped in CI.

## Step 6 — trace the ripples the plan stopped tracing

Plans describe a change at its center and assume the edges hold. Check the
edges explicitly:

- **New call sites** — a component or function now reused somewhere new: does
  every existing caller (and every existing caller's test mock) still hold?
- **Data-shape changes** — every fixture, factory, seed, snapshot, and
  serializer built on the old shape.
- **Interaction changes** — anything that alters DOM structure, focus,
  portals, overlays, or timing can break a deterministic browser/e2e test's
  locator or waiting strategy even when the app itself still works.
- **Boot and config paths** — a "minimal fix" that adds a required env var,
  key, or service makes the app un-runnable in the setups that previously
  worked without it (local dev, CI, a fresh clone, tests). Check whether the
  plan preserves the degraded-but-working path.
- **"Purely additive" claims** — verify by checking every call site, export,
  and index/registration file, not by re-reading the sentence.
- **Structural parallels** — a change applied in one place but not in its
  internal twin, which breaks nothing outwardly and so goes unnoticed: both
  vendored/duplicated copies of a file, a table's header row vs. its data
  rows, an enum and every switch/map over it, one locale's message file vs.
  the others. If the plan edits one half of a pair, check the other half.

## Step 7 — pressure-test the plan's own judgment calls

Two phrasings deserve a deliberate second look, because they are where a
single pass talks itself out of work:

- *"X and Y are deliberately different — that's fine."* Often true. Sometimes
  it's an inconsistency the planner rationalized. Go look at X and Y.
- *"This only matters in a narrow edge case, not worth fixing."* Check that
  the edge case really is narrow and really is harmless here.

Also flag the inverse: a spot where the plan proposes only a comment or a
convention where the language could actually enforce the rule (a discriminated
union instead of a "pass exactly one of A or B" comment, a constraint instead
of a note). Cheap to suggest, and it converts a future bug into a compile
error.

If the reasoning holds after you check it, say so — that's a valuable
"confirmed" line. If it doesn't obviously hold, don't resolve it unilaterally:
hand it back as an open question, since it's the user's call.

## Report format

Output the report in the conversation (and to a file only if the user asked).
Write every file:line reference as a repo-root-relative path
(`path/to/file.ts:120-134`), never absolute or cwd-relative, so reports from
different review runs stay pasteable and comparable. Use this structure:

```markdown
# Adversarial review — <plan name>

**Plan:** <path>  · **Scope reviewed:** <all / the subset>
**Review model:** <model>  · **Plan authored by:** <model/agent, if known>

## Must fix before implementation

### 1. <one-line problem statement>
- **Plan section:** <exact step/heading it refers to>
- **Evidence:** `path/to/file.ts:120-134` — <what the source actually says>
- **Why it breaks:** <the concrete failure: which test, which runtime path, which rule>
- **Suggested fix:** <specific, actionable>

## Worth flagging (not blocking)

### 1. <one-line statement>
- **Plan section:** …
- **Evidence:** `path/file.ts:NN` — …
- **Open question for you:** <when it's a judgment call, ask rather than decide>

## Checked and confirmed correct
- <claim from the plan> — verified at `path/file.ts:NN`.
- <claim> — verified; the existing test `<title>` (`path/file.test.ts:NN`) still passes under this change.

## Not checked
- <anything you couldn't verify, and why>
```

Why each part matters:

- **Must-fix vs. flag** is the whole point of the prioritization: must-fix
  means you can point at the bug, the breaking test, or the violated rule.
  If you can't, it's a flag. Inflating the must-fix list destroys the signal.
- **Every item needs plan section + file:line + a fix or an explicit
  question.** An item without evidence is an opinion, and the reader can't
  act on it without redoing your work.
- **"Checked and confirmed correct" is not padding** — it tells the reader
  what was actually verified versus silently skipped. Without it a clean
  review is indistinguishable from a lazy one, and the reader can't tell which
  parts of the plan they still need to check themselves.
- **"Not checked"** keeps you honest about coverage gaps instead of implying
  total coverage.

Close with a one-line verdict: proceed / proceed after the must-fixes / the
plan needs rework. Keep it a recommendation — the coordinator decides.

## Staying in your lane

| Don't | Do |
|---|---|
| Edit source files, run migrations, "just fix it while I'm here" | Report; implementation is a separate, later pass |
| Rewrite the plan file | Hand back findings; the plan's owner edits it |
| Rank the plan's writing quality or restructure it for style | Judge only correctness, conventions, and completeness |
| Bury a real breakage inside twelve nitpicks | Prioritize honestly; a short must-fix list is a good outcome |
| Report "looks good overall" with no evidence | Show what you read; a clean review lists confirmations |

Read-only commands are allowed and encouraged: grep, running the test suite,
a typecheck, a build's check step. Use them to *prove* a must-fix rather than
asserting it from reading code — actually run the test you claim will break
and quote the failure. Anything that writes or mutates state (editing sources,
running migrations, installing, committing, calling a mutating API) stays out
of bounds.
