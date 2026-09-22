# Spec: what must stay true of the suite itself

| | |
|---|---|
| **Spec ID** | SPEC-2026-09-22-suite-contract |
| **Status** | approved |
| **Supersedes** | none |

## Problem & why

Every other spec in this repository says what the product must do. This one says what the thing that
checks the product must do, because a suite that is not itself trustworthy is worse than no suite: a
red run that nobody believes gets rerun until it is green, and a green run that proves nothing gets
cited as evidence.

The suite's value rests on a handful of properties that are easy to erode one convenient step at a
time — a key here to reach a slow page, a pause there to settle a race, a click that happens to
write. Each is locally reasonable and collectively fatal. This spec fixes them so that eroding one is
a visible decision.

## Goals / Non-goals

**Goals**

- State the properties that make a result from this suite believable.
- Say, for each one, what actually upholds it — a mechanism, or nothing but review.
- Make the difference between those two visible, so nobody mistakes a convention for a guarantee.

**Non-goals**

- How a flow is written, which commands exist, how to run the suite. That is the package's
  `README.md`.
- Why the suite is shaped this way and what it cannot cover. That is `docs/01-determinism-by-construction.md`.
- What the application must do. Those are the other packages' specs; a flow here is evidence about
  them, never the statement of them.
- Coverage. Nothing here claims the suite tests enough — only that what it does test, it tests
  honestly.

## User stories

- As someone reading a red run, I want to conclude that the application changed, so that I
  investigate the diff instead of rerunning the job.
- As someone on a fork with no credentials, I want the suite to run, so that a contribution can be
  checked before anyone is trusted with secrets.
- As someone whose working database holds a month of imported repositories, I want to run the suite
  without risking any of it.
- As a reviewer of a new flow, I want its whole behaviour visible in the diff, so that "it also
  retries twice" cannot arrive unannounced.

## Acceptance criteria (EARS)

**What a run needs**

- **AC-1** — A flow SHALL NOT cause the application to consult a model, and the suite SHALL require
  no credential in order to run.
  _(observable: a complete run on a machine where no key is configured)_
- **AC-2** — Every locator SHALL be deterministic — an address, a literal string, or a role or
  label — and no flow SHALL identify an element by describing it to a model.
  _(observable: a step selects the same element on every run, and the run is unaffected by whether a
  key exists)_

**Where it runs**

- **AC-3** — The suite SHALL NOT write to any database, and its hermetic entry point SHALL refuse to
  migrate or seed anything other than the isolated instance it created.
  _(observable: aimed at another database, the hermetic entry point stops before touching it)_
- **AC-4** — WHERE the suite runs hermetically, every run SHALL begin from identical data.
  _(observable: two consecutive runs see the same repository, the same pull request, the same
  findings)_

**What a failure means**

- **AC-5** — WHERE the suite runs hermetically on unchanged application code, its result SHALL be
  the same every time; a flow SHALL fail only because the application's observable behaviour
  changed.
  _(observable: a failure reproduces on a rerun rather than clearing)_

**How a flow is written**

- **AC-6** — A flow SHALL be data rather than code: a name and an ordered list of commands, with no
  branch, no loop and no retry.
  _(observable: the format offers nowhere to express a condition, and a flow is readable by someone
  who has never seen the runner)_
- **AC-7** — Waiting SHALL be expressed as a condition that must become true, never as an
  unconditional pause.
  _(observable: every wait names the thing it waits for, and its failure says which condition never
  held)_

**What a run leaves behind**

- **AC-8** — A run SHALL NOT alter the data it reads.
  _(observable: the suite can be run twice in succession, and a flow can be run after any other,
  with the same outcome)_

### Verification

Unlike the other specs in this repository, almost nothing here is proven by a test — the suite is
the test. What holds each criterion up is a mechanism, a convention, or nothing, and the table says
which.

| AC | Held up by | Strength |
|---|---|---|
| AC-1 | The command vocabulary in use is three verbs across every step of every flow, none of which reaches a model; no credential appears in the runner, in `scripts/e2e.sh`, or in the environment block of `.github/workflows/e2e-web.yml` | **Mechanical in CI** — a model-backed step would fail there for want of a key. Locally, nothing stops it |
| AC-2 | A prose rule in `e2e/CLAUDE.md` | **Nothing mechanical.** A step's command is a list of strings passed through untouched by `e2e/run.ts`, so an AI-locator step would run wherever a key happens to exist |
| AC-3 | The runner has no database access of any kind — it drives a browser and nothing else; and `scripts/e2e.sh` exits rather than migrate a target that is not on the port it created | **Strong**, and the guard is explicit rather than incidental |
| AC-4 | The isolated Postgres in `scripts/e2e.sh` is created without a persistent volume and is migrated and seeded on every run | **Strong** |
| AC-5 | Follows from AC-1, AC-2 and AC-4 together | **Conditional** — see gaps; it does not hold against a developer's own stack, and a wall-clock step timeout can still fail a flow on a slow machine |
| AC-6 | The runner reads only a name, a command list, a label and an optional output check from a flow (`e2e/lib/assert.ts`), so the format has nowhere to put a condition; a failed step ends its flow rather than being retried (`e2e/run.ts`) | **Strong for control flow.** A flow is not validated against a schema at load, so a malformed file is possible — but it can only produce a bad command, never a branch |
| AC-7 | The flows as written: every wait names a URL, a text or a load state | **Review only.** Nothing rejects a timing-based step |
| AC-8 | The flows as written: every click in the suite navigates, and the single flow that reaches a form stops before submitting it | **Review only** |

### Known gaps

1. **AC-2 has no enforcement.** The rule that bans the AI locator lives only in prose. Nothing in
   the runner, the types, or a lint step would reject one, and on a developer machine with a key
   exported it would work — which is exactly the circumstance in which someone would reach for it.
   A schema check on load, rejecting any command outside the permitted verbs, is the missing
   mechanism for this and for AC-7.
2. **AC-5 does not hold against a developer's own stack.** Three flows follow the home redirect and
   land on the first repository, so a database with any other imported repository reddens them while
   the application is unchanged. The criterion is written as conditional for this reason, and the
   condition is the thing to check first when a local run disagrees with CI.
3. **AC-8 is protected across runs but not within one.** The hermetic stack reseeds before each run,
   so a mutation cannot survive into the next one. Within a run, flows share one browser and one
   database and execute in the order of their filenames, so a flow that wrote something would
   contaminate every flow after it — and the failure would appear in a flow that is not the
   offender.
4. **No flow is checked against the format it claims to follow.** A flow file is parsed and cast,
   not validated, so a typo in a field name is silently ignored rather than reported.

## Edge cases

| Case | Handling |
|---|---|
| The application is genuinely slow, and a step exceeds its timeout | The flow fails. This is the acknowledged false-positive mode of AC-5, and the reason the timeout is configurable rather than fixed |
| A flow needs data the seed does not contain | Extend the seed. Pointing the suite at a live repository trades AC-4 and AC-5 for the data, and no longer answers the same question |
| A new flow genuinely needs to mutate | It breaks AC-8 for every flow ordered after it. Either it restores what it changed, or the suite needs per-flow isolation it does not currently have |
| A step must wait for something the vocabulary cannot express | The condition belongs in the runner as a new declarative form, not as a pause inside a flow — AC-7 |
| The suite is run against a stack a developer is actively using | Supported, but AC-5 no longer holds; the hermetic entry point exists for this reason |

## Non-functional

- The suite SHALL be runnable on a machine that has never held a credential for this project.
- A run SHALL be able to proceed while a development stack is running, without disturbing it.
- A failure SHALL leave enough evidence to diagnose it without a rerun.

## Cross-module interactions

None in the usual sense: this package imports nothing from the others and nothing imports it. Its
coupling is to their *behaviour* — a flow asserts on text the client renders from data the server
serves from a seed the server owns. That coupling is deliberate and one-directional, and it means a
change to the seed is a change to this suite's inputs even though no file here is touched.

## Contracts

Shape, not implementation:

- **A flow** is a name and an ordered list of commands. Adding meaning to a flow means adding a
  declarative field to the runner, never logic to the file.
- **A result** is per-flow and per-step, and a failure names the step and the condition that did not
  hold.
- **The suite's inputs** are the seeded data and the application's rendered output. It owns neither,
  and it writes to neither.

## Untrusted inputs

The suite has none in the ordinary sense: everything it reads is authored inside this repository —
the seed, and the application rendering it. That is a property worth stating because it is
contingent rather than permanent.

Two ways it would stop being true. A flow pointed at a real imported repository would render
attacker-influenced content, and failure screenshots are uploaded as CI artifacts — so the day the
suite reviews a real pull request is the day its artifacts start carrying content from outside the
repository. And a flow that triggered a review would put model output on screen, which is untrusted
by definition. Both are ruled out today by AC-1 and AC-4; neither is ruled out by anything a
machine checks.
