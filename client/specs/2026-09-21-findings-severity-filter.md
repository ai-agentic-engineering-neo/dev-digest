# Spec: Severity at a glance across a pull request's runs

| | |
|---|---|
| **Spec ID** | SPEC-2026-09-21-findings-severity-filter |
| **Status** | approved |
| **Supersedes** | none |

## Problem & why

A completed run shows its findings as one flat list under a single total (`7 finding(s) ·
4 blockers`). A reviewer cannot answer the first question anyone asks — *how bad is this, and
can I look only at the bad parts* — without scrolling and counting by eye. Every finding
already carries a severity; the screen does not use it.

The chronological view has the same blind spot one level up: a tile says how many findings a
run produced, not of what kind, so a pull request's history reads as numbers that cannot be
compared to each other.

The one existing control narrows by *confidence*. "What is uncertain" and "what is serious"
therefore cannot be asked separately.

## Goals / Non-goals

**Goals**

- Make a run's severity breakdown readable at a glance, on its card and on its timeline tile.
- Let a reader narrow the list to the severities they care about, and widen it back.
- Keep everything local to data the page already holds — no request, no model call.

**Non-goals**

- Making timeline tiles interactive. They report; they do not filter.
- Filtering by category, file, agent or confidence — confidence has its own control.
- Persisting or sharing the selection.
- Changing severity assignment, finding cards, or their actions.
- The pull-request list's findings column — a separate, cross-module spec.

## User stories

- As a reviewer opening a run, I want each severity's count, so that I can judge the run before
  reading a card.
- As a reviewer, I want to narrow to one severity, so that I can handle serious findings first.
- As a reviewer, I want to combine two, so that I can skip only the level I do not need now.
- As a reviewer scanning history, I want each tile to show what kind of findings its run
  produced, so that I can see which run changed the picture.

## Acceptance criteria (EARS)

**The counters**

- **AC-1** — WHILE a run's findings are displayed, the system SHALL show one counter for each
  severity occurring at least once among them.
  _(observable: a run of criticals and warnings shows two counters)_
- **AC-2** — IF a severity occurs zero times, THEN the system SHALL NOT show a counter for it.
  _(observable: no suggestions means no suggestion counter, not a counter reading 0)_
- **AC-3** — The counters SHALL sit in the expanded run card, below that run's verdict and
  score and above its finding cards.
  _(observable: expanding a run meets the counters before the first finding)_
- **AC-4** — Each counter SHALL show its severity's name beside its number.
  _(observable: the row reads "4 CRITICAL · 3 WARNING", legible without knowing the icons)_
- **AC-5** — Each number SHALL equal the count of that severity's finding cards the card would
  list with no severity filter applied.
  _(observable: counter and hand-counted cards agree)_
- **AC-6** — WHILE the low-confidence control is hiding findings, the counters SHALL count only
  what that control admits.
  _(observable: hiding a low-confidence critical lowers the critical counter by one, so a
  counter never disagrees with the list beneath it)_
- **AC-7** — The counters SHALL be ordered by descending severity.

**The filter**

- **AC-8** — Below the counters the system SHALL show three filter buttons — Critical, Warning,
  Suggestion — regardless of which severities the run produced.
  _(observable: all three are present; the row is a stable control, not a moving target)_
- **AC-9** — IF a severity occurs zero times among the currently listed findings AND its
  button is not active, THEN that button SHALL be disabled.
  _(observable: a button that could only ever empty the list cannot be pressed — but an
  active button stays pressable even when its count falls to zero, because the count can
  fall to zero as a RESULT of narrowing or of hiding low confidence, and a control that
  applied a narrowing must always be able to undo it. Disabling it would strand the reader
  in an empty list whose only exit is a different control)_
- **AC-10** — WHEN a reader activates a button, the system SHALL list only findings of the
  activated severities.
- **AC-11** — WHEN a reader activates a second button, the system SHALL list the union of both.
  _(observable: critical + warning shows both, not the intersection nor the last pressed)_
- **AC-12** — WHEN a reader activates an already-active button, the system SHALL deactivate it.
- **AC-13** — WHILE no button is active, the system SHALL list every finding the other controls
  admit.
  _(observable: the initial state and the fully-cleared state agree)_
- **AC-14** — IF the activated severities admit no findings, THEN the system SHALL render the
  existing empty state AND keep the buttons visible.
  _(observable: a narrowing that emptied the list can always be undone)_
- **AC-15** — WHEN the displayed run changes, the system SHALL clear the activated severities.
  _(observable: a filter left on one run does not silently hide findings of the next)_
- **AC-16** — Each button SHALL be operable by keyboard and SHALL expose its active state to
  assistive technology.
  _(observable: reachable by Tab, toggled by Enter or Space, pressed state announced)_

**Cost of the interaction**

- **AC-17** — WHEN a filter is toggled, the system SHALL derive counts and the listed set from
  findings the client already holds, issuing no network request and no model call.
  _(observable: a full round of toggles adds nothing to the network log or the server log)_
- **AC-18** — WHEN the page is opened, the system SHALL NOT invoke a model to produce the
  counters.
  _(observable: the counters are a grouping of persisted findings, not a new question)_

**The timeline tiles**

- **AC-19** — WHILE the chronological view lists a completed run, its tile SHALL show one
  severity indicator with a count per severity that run produced.
  _(observable: the bare total is replaced by a breakdown comparable across tiles)_
- **AC-20** — Tile indicators SHALL NOT respond to activation and SHALL narrow nothing.
  _(observable: clicking one does what clicking the tile already did, nothing more)_
- **AC-21** — Tiles SHALL use the same severity symbols and ordering as the counters.
  _(observable: the two surfaces cannot be read as different scales)_

## Edge cases

| Case | Handling |
|---|---|
| Run produced no findings | No counters, all three buttons disabled, existing empty state → AC-2, AC-9 |
| Every finding hidden by confidence | No severity occurs, so no counters; buttons disabled → AC-6, AC-9 |
| One severity only | One counter, one enabled button → AC-1, AC-9 |
| Severity outside the three defined values | accepted: no handling — the contract's enum makes it unrepresentable, and a value that slipped past validation is a bug to fix at the boundary |
| Reader filters, then toggles confidence | Both apply; counts follow confidence → AC-6 |
| Two runs expanded at once | Each filters only its own list → AC-15 |
| Tile of a run that produced nothing, failed, or is still running | No indicators — a count would claim a result that does not exist → AC-19 |
| Tile of a commit rather than a run | Unaffected; it has no findings to describe |

## Non-functional

- Toggling a filter SHALL complete within 100 ms for a run of up to 200 findings, measured from
  the input event to the committed re-render.
- The feature SHALL add zero bytes to any API response and zero requests to page load.

## Cross-module interactions

None. The feature is confined to the client and consumes an already-fetched run: no server,
contract or database change. Hence a client-local spec rather than a root one.

## Contracts

Unchanged. The feature reads two fields every finding already carries: `severity`, one of
exactly `CRITICAL`, `WARNING`, `SUGGESTION`; and `confidence`, a number from 0 to 1 already
consumed by the low-confidence control. The activated set is client state — never sent,
never persisted, in no contract.

## Untrusted inputs

No new exposure. Counts are integers over a closed enum, and the cards a filter shows or hides
were already rendered by existing code under existing rules. Finding titles and rationales do
originate from model output over attacker-influenced diffs, but this feature neither reads nor
re-renders them.

## Open questions

None.

The counters and the filter are deliberately two rows rather than one merged control. A single
row of clickable counters is tempting and is what the working reference does, but it forces a
choice between two criteria that both apply: counters must show only severities that occur,
while the filter must offer all three. Split apart, each rule lands on its own row and neither
is bent. The cost is one extra row; the gain is that nothing is left unresolved.
