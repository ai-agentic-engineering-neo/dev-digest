# The flow-file contract

What a `specs/NN-name.flow.json` file may contain, and the constraints every
flow has to respect. This is the spec that `run.ts` enforces.

> Terminology, because it collides: **`e2e/specs/`** holds already-built test
> flows (JSON). **`e2e/docs/specs/`** — this folder — holds prose feature specs.
> Same word, different content.

## Why a JSON convention at all

agent-browser is a browser-automation CLI, not a test framework. There is no
`describe`/`it`, no assertion library, no reporter. So the suite defines the
thinnest possible convention on top: a flow is a list of CLI invocations, run
in order, sharing one browser session (the daemon keeps the page alive between
commands).

The assertion mechanism falls out of that for free: **a command that exits
non-zero fails the step and the flow.** A `wait --text "3 findings"` whose
condition never holds exits non-zero, so it is simultaneously a navigation step
and an assertion. Nothing else is needed.

## File shape

```json
{
  "name": "one line, what this flow proves",
  "description": "why these steps, what's seeded, what it exercises",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "load the app root" }
  ]
}
```

- `cmd` — the agent-browser argv, verbatim.
- `label` — what this step is *for*, in the failure output. A label that
  restates the command ("click button") is wasted; say what it proves.
- `{BASE}` is substituted from `E2E_BASE_URL` (default `http://localhost:3000`).
- Run order is the **lexical order of filenames**, hence the `NN-` prefix.

## Hard constraints

1. **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
2. **Never use the AI `chat` command.** It would make the suite
   non-deterministic and require an API key, destroying the two properties that
   make it usable in CI. This is a do-not-touch rule.
3. **Read-only seeded data.** No flow triggers a review, so no flow spends
   tokens or needs a provider key.
4. **Assert user-visible English text, verbatim.** `wait --text "3 findings"`
   reads as the requirement it enforces.

## The coupling that bites

Because assertions are literal strings, a flow is coupled to two things that
live elsewhere:

- **The seed.** Flows `02`/`04`/`05` assume `acme/payments-api` (PR #482) is
  the *only* repo in the DB. Against a normal dev database with other imported
  repos they fail — which is why `./scripts/e2e.sh` (isolated stack on
  5433/3101/3100) is the default runner, not `npm test`.
- **The seeded counts.** `04-pr-findings.flow.json` asserts `"3 findings"`.
  Adding or removing a finding for PR #482 in `server/src/db/seed.ts` must
  update the flow in the same change, or it goes stale — and the worse failure
  mode is that it keeps *passing* on an unrelated substring match
  (`e2e/INSIGHTS.md`, 2026-09-21).

## What a good flow looks like

`04-pr-findings.flow.json` is the reference. It walks the real user path —
root → PR list → PR row → Agent runs tab → expanded run — and each `wait`
proves one claim: the verdict rendered, the header count is right, the seeded
FindingCard is visible without an extra click (because the newest accordion is
`defaultOpen`), the severity filter narrows the list, and clicking the active
control again restores it.

Note what it does *not* do: it never clicks through to assert an
implementation detail, and it never asserts on a count it computed itself. It
checks what a user would see.

## Writing a new flow

1. Write the prose spec here in `docs/specs/` first.
2. Take the next free `NN`; never reuse a number (order is meaningful).
3. Check the seed actually contains what you're about to assert.
4. Run it hermetically: `./scripts/e2e.sh`.
5. Make it fail on purpose once — change an expected string — and confirm the
   failure output names the step. A flow that can't fail isn't testing anything.
