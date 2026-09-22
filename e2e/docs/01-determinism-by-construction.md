# Determinism by construction

Why this suite is shaped unlike a normal e2e set, and what the shape rules out.

[`../README.md`](../README.md) is the manual: the flow format, the locator list, the runner and its
environment knobs live there and are not repeated. This file is about the decisions underneath —
why the driver is a CLI rather than a test framework, why the suite has no key and no model, why it
insists on its own stack, and which scenarios it therefore cannot cover at all.

The through-line is that determinism here is **structural, not aspirational**. A flaky assertion is
normally something a suite fights with retries and waits. This one removes the sources instead: no
model in the loop, no key to expire, no shared database to drift, no data that a previous run
changed.

## A CLI, not a test framework

The driver is Vercel's agent-browser — a native Rust binary speaking CDP — and the package leans on
that being a *command-line tool* rather than a library
(`e2e/package.json:6`). There is no in-process browser handle anywhere in this package. Every step
is a separate process: the runner shells out with `execFile` and waits for the exit code
(`e2e/run.ts:45`).

Three consequences follow, and they are the real difference from a Playwright-shaped suite:

- **State lives in a daemon, not in a variable.** Consecutive commands share one browser session
  because the tool keeps the page alive between invocations (`e2e/run.ts:6-7`), which is why a flow
  can `open` in one step and `find … click` in the next without passing anything between them. The
  session is torn down once, in a `finally`, whatever the outcome (`e2e/run.ts:108-111`).
- **The exit code is the assertion.** `wait --text` and `wait --url` fail by timing out and exiting
  non-zero, so the runner needs no matcher library: a non-zero exit fails the step and ends the flow
  (`e2e/run.ts:80-88`). The only thing layered on top is an optional substring check on stdout
  (`e2e/run.ts:73`). `lib/assert.ts` is bookkeeping, not an assertion framework, and says so
  (`e2e/lib/assert.ts:2-5`).
- **There is no fixture, hook or parallelism model** — because a CLI has none to offer. Flows run
  sequentially in the lexical order of their filenames (`e2e/run.ts:54-56`), which is why the `NN-`
  prefix is load-bearing rather than decorative.

What this costs is worth stating plainly. There is no network interception, no request stubbing, no
clock control, no ability to assert on anything the page does not render, and no way to reach into
component state. Everything this suite knows about the app, it knows through rendered text and the
URL. That is a real ceiling, and it is why the coverage table in the README is labelled
*typological, not exhaustive* (`e2e/README.md:92`).

## The banned locator, and what banning it buys

agent-browser also ships an AI locator — a `chat` command that finds an element by describing it.
It is forbidden here (`e2e/CLAUDE.md:19-20`).

The rule is easy to read as caution about flakiness. The larger consequence is that **the suite has
no API key and makes no model call**, and that is what lets it run in places a key-bearing suite
cannot: an untrusted pull-request CI job, a machine with no secrets configured, a contributor's
laptop on a fork. Allowing `chat` in one step would not merely make that step slower — it would give
the whole package a credential to manage and a per-run bill, and the first CI job without a key
would fail for a reason that has nothing to do with the app.

The second consequence is that a failure means something specific. `wait --text "2 findings"` fails
when that text is absent; it cannot fail because a model decided a different element matched a
description. When a deterministic flow goes red, the app changed.

## No model anywhere, and the hole that leaves

The no-model rule extends past the locators: the flows deliberately never trigger a review
(`e2e/CLAUDE.md:21-22`). They read seeded rows that already contain a review and its findings —
`server/src/db/seed.ts:135-150` inserts exactly that, "a sample review + findings so the PR shows
results before the first run".

So the suite proves the app renders a review. It cannot prove the app *produces* one. Everything
downstream of pressing **Run Review** is outside its reach by construction:

- the run trigger, the SSE stream, the live log and the running → idle transition
- anything grounding-, score- or prompt-related, since no prompt is ever assembled
- accept / reject / reply on a finding, which mutate and would leave the seed dirty for the next
  flow
- the failure paths — a missing key, a provider error, a cancelled run

Those belong to the server's integration tests and the client's component tests
([`../../TESTING.md`](../../TESTING.md)). The division is not an accident of effort: a flow that
called a model would cost money per run, take minutes, and produce a different review each time —
it would be the one test in the suite that could not be trusted when it failed.

## Why not just point it at the dev stack

Because two different things break, and only one of them is obvious.

The obvious one: three flows follow the home redirect, which lands on the *first* repo in the
database. A dev database with any imported repository besides the seeded demo therefore sends flows
02, 04 and 05 to the wrong repo (`e2e/README.md:38-44`). The hermetic stack avoids this by being
ephemeral — the isolated Postgres runs with `--rm` and no named volume (`scripts/e2e.sh:87`), so it
is empty every run and the seeded repo is necessarily the only one.

The less obvious one: the flows assert on seeded content, and a dev database's content is whatever
you were working on last week. That is why the isolation is not just "a second database" but a
freshly migrated and seeded one every time (`scripts/e2e.sh:126-128`).

The script is careful in ways worth knowing before editing it:

- **It refuses to migrate anything that is not the isolated port.** A guard checks `DATABASE_URL`
  and exits rather than run `db:migrate` against whatever was configured
  (`scripts/e2e.sh:121-124`). Given that the alternative is seeding over your own development data,
  this is the most important five lines in the file.
- **Teardown walks the process tree.** `pnpm exec tsx` and `next dev` spawn the actual listener as a
  grandchild, so killing the child leaves the port bound; `kill_tree` recurses leaves-first
  (`scripts/e2e.sh:60-66`), and the port backstop only ever reaps the alternate ports, never the dev
  stack's 3000/3001 (`scripts/e2e.sh:72-78`).
- **It is a local convenience and CI does not use it.** CI brings up its own stack and calls the
  plain runner (`scripts/e2e.sh:17-18`). A change that makes the suite pass only through this script
  will not be exercised by CI, and the reverse also holds — which is the likeliest way for the two
  to drift apart.

## PR #482 is both the foundation and the trap

The seeded pull request has `pr_files` rows carrying real `additions` and `deletions` but no patch
text at all (`server/src/db/seed.ts:120-124`). The same property reads two opposite ways depending
on what you are doing.

**Here it is the foundation.** The flows need data that never changes and never costs anything, and
a PR whose content is fixed at seed time is exactly that. It also explains a detail of flow 05 that
looks like an oversight and is not: the diff flow asserts that a changed *file name* renders
(`e2e/specs/05-pr-diff.flow.json`), and stops there. It does not assert a single line of diff,
because there is none to assert. The flows are shaped around what the seed can support.

**Elsewhere it is a trap**, and one already paid for: a review run against #482 completes green with
zero findings and a score of 100, which reads as "the reviewer works" when in fact the model was
handed no diff (`server/INSIGHTS.md` § *What Doesn't Work*). Anything that validates findings,
grounding or scoring needs a real imported repository instead.

Both readings are correct at once. The rule that falls out: **use #482 to check that the UI renders,
never to check that the reviewer reviews** — and when a flow here starts needing real diff content,
the answer is to extend the seed, not to point the suite at a live repository.

## Flows are JSON, and that is a decision

A flow is data — a name and a list of argv arrays (`e2e/lib/assert.ts:18-22`) — not a test function.
The runner substitutes `{BASE}` and passes every array through untouched
(`e2e/lib/assert.ts:36-39`).

What that buys:

- **No expressiveness to misuse.** JSON cannot branch, loop, sleep, or retry, so no flow can quietly
  become conditional on timing or environment. A flow is the same sequence every run by
  construction, which is the same argument as banning the AI locator, applied to control flow.
- **A flow is readable by someone who does not know the runner**, and reviewable in a diff as a list
  of user steps rather than as code.
- **The runner stays tiny** — roughly 120 lines whose only jobs are substitution, sequencing and
  reporting.

What it costs: anything a flow genuinely needs must be added to the *runner*, as a new declarative
field, rather than written inline in the flow. `assert.stdoutIncludes` is the only such field so far
(`e2e/lib/assert.ts:15`). That friction is the point — it makes adding conditional behaviour a
deliberate act with a review attached, instead of a line someone slips into one flow.

## What is not here

| For | Go to |
|---|---|
| The flow format, locators, running, env knobs, coverage | [`../README.md`](../README.md) |
| Choosing between unit, integration and e2e for a change | [`../../TESTING.md`](../../TESTING.md) |
| What the server does when a review actually runs | [`../../server/docs/01-review-run.md`](../../server/docs/01-review-run.md) |
| How the UI gets its data, and what a live run looks like in the client | [`../../client/docs/01-ui-architecture.md`](../../client/docs/01-ui-architecture.md) |
| Why the seeded PR cannot exercise the reviewer | `server/INSIGHTS.md` § *What Doesn't Work* |
| agent-browser's own command surface | its upstream documentation — this package pins no wrapper around it |
