# specs — client

Specs / acceptance criteria for the `client` package.

## Severity pills (Review-runs accordion) — `FindingsPanel`

- Rendered directly under `VerdictBanner`, above the existing
  "hide low confidence" toggle.
- One pill per severity **with count > 0 only** — a severity with zero
  findings gets no pill at all.
- Text is literally `N CRITICAL`, `N WARNING`, `N SUGGESTION` (count before
  the label, uppercase), pills joined by `·` — this does NOT reuse
  `SeverityBadge`'s default icon→label→count order or its `compact` mode
  (which drops the label), since neither produces the required order.
- Counts **include** dismissed findings (see root `docs/README.md` for why).
- Click a pill → filters the finding-cards below to only that severity.
  Click the same pill again, or press Escape → clears back to the full list.
- The pill's own count must always equal the number of finding-cards
  actually rendered below it, at the current "hide low confidence" setting —
  both are derived from the same `afterConfidence` array.
- Clicking a pill resets keyboard focus (`j`/`k`) to index 0, so `a`/`d`
  shortcuts never silently act on nothing after a filter shrinks the list.

## Read-only popover — `components/findings-by-severity/`

- Three placements, one component: PR list row (counts = the PR's **latest
  review only**, all runs); PR Detail Timeline tile (counts = **that one
  run only**); PR Detail Review-run accordion **header** (counts = that
  run's **active** findings, rendered `compact` so it carries no visible
  severity-name text).
- Popover title is exactly `N FINDINGS IN THIS RUN`.
- Each listed finding shows: severity icon, title, category, `file:line`,
  confidence %, short description — **no buttons**, ever. This is a preview
  surface; it never gates or triggers Accept/Dismiss.
- Counts **exclude** dismissed findings; accepted findings still count.
- Hover opens; a short close-delay bridges leaving the trigger and entering
  the portaled panel. Pressing Escape, or clicking outside (trigger AND
  panel), closes/clears it. **Hover behaviour is identical at all three
  placements** — same popover, same `N FINDINGS IN THIS RUN` title, same
  read-only cards.
- **Click semantics are deliberately per-placement** (not one global rule —
  the popover is never "a filter on another list"; it either pins itself or
  hands the click to the page):
  | Placement | Props | On click |
  |---|---|---|
  | PR list row | `onSeverityClick` | fires it (cross-page `router.push` to `?tab=findings&severity=…`); does **not** pin/narrow — the page is being left |
  | Timeline tile | `onSeverityClick` | fires it (`onGoToReview(runId, sev)` → scroll to that run's accordion + filter it); does **not** pin/narrow |
  | Accordion header | `onSeverityClick` + `pinOnClick` | fires it (parent syncs `?agent=&severity=`) **and** still pins + narrows its own popover — the only "both fire" site, because it's already at the Review-runs section |
  | anywhere else | neither | unchanged pin + narrow (the safe default for any future caller) |
- All-zero counts render a single muted `—` (`data-testid="findings-badge-empty"`),
  with no popover wiring at all.
- **Not in scope of the above:** `FindingsPanel`'s `SeverityFilterPills`
  (see the section above) is a *different* widget with its own
  click-to-filter/click-again-to-clear contract, which is unchanged: no
  hover popup, same rendering, same counting. Deep links reach it only via
  `FindingsPanel`'s `initialSeverity`/`focusNonce`, which drive the very same
  `setSeverityFilter` the pills already own.
- **URL sync for the pills (2026-09-18):** a *user* change of that filter —
  pill click, re-click to clear, or Escape — is mirrored into the address
  bar: `?agent=<run_id>&severity=<SEV>` while a pill is active, `severity`
  removed once it's cleared. Mount/remount (e.g. arriving via a deep link)
  never writes the URL. Runs with no `run_id` (the seeded demo review) have
  no `agent` to pair it with, so their pills leave the URL untouched.

## Accept / Dismiss visual states — `FindingCard`

| State | Accept button | Dismiss button | Title | Top-right tag |
|---|---|---|---|---|
| Untouched | enabled | enabled | normal | none |
| Accepted | **disabled**, blue border | enabled | strikethrough | green, checkmark |
| Dismissed | enabled | **disabled**, blue border | normal | gray, X |

- "Disabled" is the real HTML `disabled` attribute — the matching button is
  unclickable/unfocusable, not just styled. The other button stays live so
  the state can be switched.
- A `pending` in-flight mutation disables **both** buttons regardless of
  accepted/dismissed state.
- Card background dims (`opacity: 0.6`) whenever accepted OR dismissed.

## Top-right avatar

- Shows the connected GitHub account's real photo when `GET /workspace`
  returns a `github_user`. Falls back to a neutral `"?"` initial (not a fake
  identity) when no GitHub token is configured, and falls back the same way
  if the image URL 404s/fails to load.
- `Avatar`'s `imageUrl` prop is additive/optional — every other existing
  caller (e.g. PR author avatars in `PRRow.tsx`) renders unchanged.
