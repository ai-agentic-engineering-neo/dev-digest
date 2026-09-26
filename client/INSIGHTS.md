# Insights — client

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

> **Consolidated 2026-09-23** with the user's approval: merged the two
> number-rendering entries into one (plus a third sighting), condensed three
> others. No finding was dropped. Prior: `git show HEAD:client/INSIGHTS.md`.

## What Works

- 2026-09-19 — `overflow: hidden` clips absolutely-positioned descendants but
  NOT `position: fixed` ones, so a hover popover inside the PR list's
  `s.tableCard` (which is `overflow: hidden`) needs no portal — `createPortal`
  appears nowhere in this codebase, and `kit/Modal.tsx` is the fixed-position
  precedent → position such a panel `fixed` from `getBoundingClientRect()` in a
  `useLayoutEffect`, after checking no ancestor creates a containing block
  (`transform`/`filter`/`will-change`/`contain` — `AppFrame`, `AppShell`,
  `layout.tsx` and `globals.css` currently do not). The cost is that it does not
  follow the scroll container, so close it on `scroll` (capture) and `resize`.
  (ref: client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx)

## What Doesn't Work

- 2026-09-23 — `kit/Checkbox`'s `label` is VISIBLE text, not an accessible name:
  it renders `{label}` inside the wrapping `<label>` (Checkbox.tsx:12, no
  `aria-label` prop), so passing a whole sentence for `getByLabelText` to find —
  `label={t("card.select", { rule })}` — put the entire rule on screen, and in a
  flex row it took the full width and squeezed the sibling content column into a
  one-word-per-line strip. Tests passed and the accessible name was correct, so
  only the rendered page showed it → pass a visually-hidden span
  (`position:absolute; clip:rect(0 0 0 0)`) as the `label` when the name is for
  AT and tests only. Two flex rules belong with it: the growing column needs
  `minWidth: 0` (a flex item will not shrink below its content without it) and
  every sibling that must keep its size needs `flexShrink: 0`.
  (ref: client/src/app/repos/[repoId]/conventions/_components/ConventionCard/styles.ts)

- 2026-09-19 — `toFixed(2)` is NOT decimal rounding and quietly shows money a
  cent short: it rounds the binary value, so `(1.005).toFixed(2)` is "1.00",
  `(0.145).toFixed(2)` is "0.14" and `(8.475).toFixed(2)` is "8.47". Costs make
  this visible because a Postgres `SUM()` over `double precision` yields values
  like 0.012000000000000002 → round through `roundTo()` in `src/lib/format.ts`
  (scale, re-read at 12 significant digits, `Math.round`) before formatting any
  currency. (ref: client/src/lib/format.ts:9)

- 2026-09-19 — Editing `messages/en/*.json` by loading + re-dumping the JSON
  reformats pre-existing lines: `runs.json` had a hand-indented `"copied"` key
  that a rewrite silently "fixed", polluting the diff with a change nobody asked
  for → add i18n keys with a targeted `Edit`, or re-dump and then restore the
  untouched lines; always read `git diff -- messages/` before moving on.
  (ref: client/messages/en/runs.json:71)

## Codebase Patterns

- 2026-09-22 — `kit/Modal` pads its header (`18px 24px`) and its footer
  (`16px 24px`) but renders `children` edge-to-edge, so a body that sets only
  `display:flex; gap` sits flush against all four walls — and it looks padded in
  review, because the header above it is not. The asymmetry is deliberate:
  `PromptModalBody` needs the full width for its own bordered sub-sections →
  every caller pads its own body with `padding: 24` in its `styles.ts`, and a new
  modal that forgets it ships unpadded with nothing failing. Both L02 skills
  modals shipped this way. (ref: client/src/vendor/ui/kit/Modal.tsx:60)

## Tool & Library Notes

- 2026-09-26 — In a test-writer red-proof worktree with `client/node_modules`
  symlinked in, `pnpm exec vitest` tries to reinstall and dies with "workspace
  hoist directory is not a real directory" — contradicting the claim in
  `.claude/agents/test-writer.md:185` that the symlinks work for all three
  packages → call `./node_modules/.bin/vitest run <files>` directly in `W/client`.
- 2026-09-26 — Correction to the line above: `server/` fails the same way (not
  client-only), and `.claude/agents/test-writer.md` § Step 5 now documents the
  binary form for both, incl. `../scripts/hermetic.sh ./node_modules/.bin/vitest`.

- 2026-09-23 — `@testing-library/user-event` is NOT a dependency here (absent
  from `package.json` and `pnpm-lock.yaml`), and importing it fails the whole
  test FILE with `Failed to resolve import` — and it cannot be added, because
  lock files are off-limits per AGENTS.md → drive interactions with `fireEvent`
  from `@testing-library/react`, as all 24 existing test files do; a native
  `<select>` (`kit/SelectInput`) changes with
  `fireEvent.change(el, { target: { value } })`.
  (ref: client/src/app/agents/_components/AgentsListView/_components/CreateAgentModal/CreateAgentModal.test.tsx:2)

- 2026-09-22 — next-intl's `useFormatter().dateTime()` throws
  `IntlError: ENVIRONMENT_FALLBACK` on every render here, because no global
  `timeZone` is configured in `src/i18n/` — it still renders (falling back to the
  runtime zone) so the UI looks fine and only the test output goes red, once per
  row → format timestamps with plain `new Date(x).toLocaleString()`, as the rest
  of the app does (`RunHistory.tsx:203,260`); adopting `useFormatter` means
  configuring `timeZone` first, or Next also warns about hydration mismatches.

- 2026-09-22 — A colocated test's relative depth to `messages/` is one level
  MORE than to `src/lib/`, and getting it wrong fails the whole suite FILE with
  `Failed to resolve import`, not a single test: count to `src/` for code and to
  the package root for `messages/`. `vi.mock` paths must match the COMPONENT's
  specifier, not the test's.
  (ref: client/src/app/skills/_components/SkillsListView/_components/ImportSkillModal/ImportSkillModal.test.tsx:5)

## Recurring Errors & Fixes

- 2026-09-19 / 2026-09-20 / 2026-09-23 — A rendered number is three times now
  unmatchable by `getByText` / agent-browser `wait --text`: adjacent JSX nodes
  become separate text nodes and flex `gap` fakes the space, so it LOOKS right.
  A number that must be assertable needs ONE i18n message and, where no word is
  shown, an `aria-label`:
  - number + word — `<span>{count}</span>{label}` reads "2Critical" → one message
    (`"{count} CRITICAL"`), with the casing in the message, not a
    `textTransform`. (ref: .../SeverityFilterBar/constants.ts)
  - bare digit — `SeverityBadge compact` renders an icon and "2"
    (`{compact ? null : s.label}`, Badge.tsx:80), so there is nothing to match →
    wrap it in a `role="img"` span whose `aria-label` is that same message (AT
    then reads the label, not the digit) and assert with `getByLabelText` /
    agent-browser `find label`. (ref: .../RunHistory/RunHistory.tsx:104)
  - number + unit — `{pct}%` splits into "82" and "%"; the conventions card hit
    this despite both entries above already existing.
    (ref: .../conventions/_components/ConventionCard/ConventionCard.tsx)

## Session Notes

- 2026-09-23 — L02 conventions: `/repos/:repoId/conventions` triage board
  (scan summary, status filters, evidence deep-links, multi-select → create
  skill), and `SkillTypeSelect` promoted to `src/components/skill-type-select/`
  (spec: client/specs/L02-conventions.md).
- 2026-09-22 — L02 skills: `/skills` grid + `/skills/:id` editor
  (Config/Preview/Versions with an LCS body diff and a destructive restore), a
  `creatable` mode on `SearchableSelect`, and the agent editor's Skills tab
  (spec: client/specs/L02-skills.md).
- 2026-09-19 → 20 — L01 findings visibility: severity counters + filter in the
  run card, a hover popover on the PR list, a shared read-only `FindingPreview`,
  and per-severity counters on the timeline row
  (spec: client/specs/L01-findings-visibility.md).

## Open Questions
