# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## What Doesn't Work

- **2026-09-18** — `find text X click` right after `wait --url` (no
  intervening `wait --text X`) is a real race against the PR list's async
  fetch — reproduced consistently (not a one-off flake) against the hermetic
  stack: `04-pr-findings.flow.json` and `05-pr-diff.flow.json` both failed on
  "open the PR row" every run until a `wait --text "Add rate limiting to
  public API endpoints"` step was inserted before the `find...click`,
  matching the pattern `02-repo-pulls-detail.flow.json:7-8` already used.
  `find` locates and acts immediately; only `wait` polls for an element to
  appear. Every new flow that opens a PR row should copy flow 02's
  wait-then-click order, not flow 04/05's original (buggy) order.
- **2026-09-18** — `agent-browser find text "X" click` fails to resolve a
  click target when `"X"` is a bare text node sibling to other elements
  inside the same clickable container (e.g. `<button><Icon/><span>{count}</span>{label}</button>`),
  even though `wait --text "X"` (existence-only) succeeds against the exact
  same DOM. Wrapping the label in its own `<span>{label}</span>` fixed it
  immediately. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/SeverityFilterPills.tsx:41`.
  For any future flow driving a click via `find text`, prefer text that's
  already an element's sole/direct child over text mixed with sibling nodes.

## Tool & Library Notes

- **2026-09-18** — `agent-browser get count <selector>` (e.g.
  `[data-finding-id]`) plus `"assert": {"stdoutIncludes": "N"}` is a clean,
  deterministic way to prove something disappeared from the DOM after an
  interaction (a real element-count drop), instead of trying to assert
  *absence* of specific text — `agent-browser`'s command model has no
  built-in "assert text is NOT present" primitive; presence is inferred
  through `wait --text`, but there's no symmetric wait-for-gone documented.
  Requires the component under test to already expose a stable, countable
  attribute (`data-finding-id` on `FindingCard`, pre-existing:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:55`).

- **2026-09-18** — `agent-browser find text "Configure agents" click` fails
  against a menu item whose label is `Configure agents…` (U+2026 ellipsis) —
  `find text` did not resolve the partial string here. `find role button
  click --name "Configure agents…"` (full label, real ellipsis character)
  works. Prefer `find role … --name` over `find text` for anything whose
  visible label comes from `messages/en/*.json`, since those strings carry
  typographic characters (…, —, ’) that are easy to mistype in a flow.
  Evidence: `e2e/specs/09-pr-list-actions.flow.json:77-87`.
- **2026-09-18** — `get count "<css>"` + `assert.stdoutIncludes` is enough to
  assert **column ORDER** deterministically, without any new runner
  capability: a selector like `[data-testid='cost-cell']:nth-child(7)`
  matches only when that cell really is the 7th child of its row. That is
  how flow 02 pins the PR table's new order
  (`e2e/specs/02-repo-pulls-detail.flow.json:28-60`). Note the assertion is a
  substring check, so it is only trustworthy when the expected count is a
  single digit that cannot be a prefix of a larger real count (the seed has
  exactly one PR row, so "1" is safe here).
- **2026-09-18** — Adding `role="menu"`/`role="menuitem"` to
  `client/src/vendor/ui/kit/Dropdown.tsx` (correct ARIA pairing) silently
  broke an `agent-browser find role button --name "…"` step targeting a
  dropdown item: an element with an explicit `role` no longer matches its
  implicit `button` role. Flows that locate dropdown entries must use
  `find role menuitem …`. Worth re-running the flows after ANY a11y-role
  change in `vendor/ui` — unit tests that query by text won't catch it.
  Evidence: `e2e/specs/09-pr-list-actions.flow.json:39-49` (the dropdown
  trigger) and `:77-87` (the dropdown item).
- **2026-09-18 (supersedes the entry above)** — those `role="menu"` /
  `role="menuitem"` attributes have since been REMOVED from
  `client/src/vendor/ui/kit/Dropdown.tsx:133-139`: none of the keyboard contract the
  ARIA menu pattern promises (arrow keys, focus move on open, Escape,
  `aria-haspopup`/`aria-expanded` on the trigger) is implemented, so the roles
  announced a widget that doesn't behave like one. Dropdown items are plain
  buttons again → locate them with `find role button --name "…"`, and the menu
  container via its stable `[data-testid='dropdown-menu']` (flow 09 uses
  `body > [data-testid='dropdown-menu']` to prove the portal, at
  `e2e/specs/09-pr-list-actions.flow.json:66-76`). The underlying
  lesson still holds: an explicit `role` on a native element hides its implicit
  role from `find role`, so re-run the flows after any a11y-role change.
- **2026-09-18** — `wait --text` matches RENDERED text, not the DOM's source
  casing: `wait --text "Timeline"` times out against `SectionLabel`, whose CSS
  uppercases its children — `wait --text "TIMELINE"` passes against the exact
  same markup. Any label styled with `text-transform` must be waited on in its
  rendered form. Evidence: `e2e/specs/10-timeline-commit-row.flow.json:13`.
- **2026-09-18** — lucide-react re-exports some icon names as ALIASES, and the
  generated `lucide-*` class follows the ALIAS TARGET, not the imported name:
  `Icon.GitCommit` renders `class="lucide-git-commit-horizontal lucide"`, so
  `get count "svg.lucide-git-commit"` returns 0. Prefer a prefix match —
  `svg[class*='lucide-git-commit']` — for any icon-based selector, so a lucide
  bump that re-points an alias can't silently zero out a count assertion.
  Evidence: `e2e/specs/10-timeline-commit-row.flow.json:15`.

## Codebase Conventions

- **2026-09-18** — `server/src/db/seed.ts` writes NO `agent_runs` rows, and the
  seeded review carries no `run_id` (`server/src/db/seed.ts:136-147`). So on
  PR #482's Agent-runs tab the
  Timeline renders COMMIT rows only: every run-row widget (the copy-shareable-
  link button, the per-run trace button, the per-run severity chips) is simply
  absent in e2e. Producing one would require a real review run, i.e. a live
  model call, which every flow here is forbidden from making — cover those
  widgets with client unit tests (`RunHistory.test.tsx`) instead of trying to
  reach them from a flow.
