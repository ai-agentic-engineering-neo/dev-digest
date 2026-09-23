# The 5-phase work cycle

How a change gets made in DevDigest. Every phase leaves an **artifact in the
repo** — that's the point of the cycle, not the ceremony. If a phase produced
nothing you can point at, it didn't happen.

| Phase | Question it answers | Artifact it leaves |
|---|---|---|
| 1. Initiation | What is actually being asked, and what do we already know? | the request + the module's `INSIGHTS.md`, read before touching code |
| 2. Planning | What will change, and what did we decide against? | `<module>/specs/<feature>.md` |
| 3. Implementation | Does it exist? | the code commit |
| 4. Validation | Does it work, provably? | tests in the same commit + a green `typecheck`/`test` run |
| 5. Completion | What would the next session otherwise re-learn the hard way? | new entries in `<module>/INSIGHTS.md` |

---

## 1. Initiation

Read before writing. Concretely: the module's [`INSIGHTS.md`](../CLAUDE.md#session-protocol)
(entries are high-confidence unless the code contradicts them), its
`CLAUDE.md` for the do-not-touch zones, and
[`docs/architecture.md`](./architecture.md) if the change crosses a package
boundary.

Output of this phase is a sharpened problem statement — including which of the
4 packages it lands in, since they are independent and a wrong guess means the
wrong lockfile and the wrong package manager.

## 2. Planning

A spec in `<module>/specs/<feature>.md` **before** the code, not a write-up
after it. A spec that only describes what was built is documentation; this one
has to be falsifiable while there's still time to change course. It records:

- the goal, in terms of what a user sees;
- the decision **and the alternative that was rejected, with the reason** —
  this is the part that pays off later, when someone asks "why isn't it X";
- explicit out-of-scope items, so scope creep is visible.

A superseded decision is corrected by a new dated section in the same spec, so
the reasoning stays legible (see the 2026-09-23 revision in
[`client/specs/severity-filter.md`](../client/specs/severity-filter.md)).

## 3. Implementation

Code. Two rules that come from this repo specifically:

- Pure logic goes in a helper that can be unit-tested without a DB or a browser
  (`server/src/modules/pulls/status.ts`,
  `client/src/.../FindingsPanel/helpers.ts`) — the route or component then just
  wires it.
- A comment that states the *semantics* outlives one that restates the code.
  `sumRunCosts` carries "null is unknown, never free" precisely because that
  invariant is not visible from the types.

## 4. Validation

Not "it looked right in the browser".

- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `cd client && pnpm typecheck && pnpm test`
- `cd reviewer-core && npm run typecheck && npm test`
- Browser-level behaviour → an `e2e/specs/NN-name.flow.json` flow, run through
  `./scripts/e2e.sh` (hermetic).

The test must encode the *invariant*, not the current output. "Pill count
equals the number of cards rendered below" survives a redesign; "renders the
number 3" does not.

## 5. Completion

Run the [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. It appends to the touched module's `INSIGHTS.md` — dated, evidence-backed
(`path/file.ts:42`), append-only. What earns an entry: a wrong assumption that
cost real time, a decision with its reason, a tool quirk, a correction from the
user. What doesn't: anything inferable by reading the code.

---

## Worked example — the severity counters + filter

Every phase of this feature is a file you can open.

1. **Initiation** — the ask was "findings counters by severity". Reading
   `client/INSIGHTS.md` first surfaced the existing `visibleFindings()`
   chokepoint, which is why the counts hook into it instead of a second
   filtering path.
2. **Planning** — [`client/specs/severity-filter.md`](../client/specs/severity-filter.md),
   written before the components, including the "Count semantics" section that
   pins down *which* array gets counted, and an explicit out-of-scope list.
3. **Implementation** — commit `fe6cf63 feat: add findings by severity`:
   `SeverityPills`, `SeverityFilterButtons`, `FindingsPopover`, the
   `countBySeverity` helper, and `rollupSeverities` on the server.
4. **Validation** — the same commit carried six test files
   (`FindingsPanel.test.tsx`, `SeverityPills.test.tsx`, `PRRow.test.tsx`,
   `FindingsPopover.test.tsx`, `SeverityFilterButtons.test.tsx`,
   `server/test/pulls-status.test.ts`). The count invariant is tested directly,
   including with "hide low confidence" on.
5. **Completion** — `client/INSIGHTS.md` gained the entry explaining why the
   pill count must be tallied *after* `hideLow` but *before* the severity
   filter, with `helpers.ts:5` as evidence.

The later revision — making the pills themselves the filter control — went
through the same five phases: the rejected-alternative section of the spec was
superseded by a new dated one rather than rewritten, and the new behaviour
arrived with its own tests.
