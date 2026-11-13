# Severity counters

Status: implemented
Packages: server, client

## Goal

Show a PR's severity mix at a glance — e.g. `3 CRITICAL · 5 WARNING · 2 SUGGESTION` —
and let the reviewer narrow the findings list to one level with a single click.

## Scope

In scope: three surfaces.

1. **PR list:** a new `FINDINGS` column (after `SCORE`) with per-severity counters
   (icon + number). Hovering opens a popover with the PR's findings (loaded lazily).
2. **PR detail → Agent runs, summary bar:** `3 CRITICAL · 5 WARNING · 2 SUGGESTION`
   above "Review runs". Clicking a level shows only that level's findings in every run;
   clicking it again (or "Show all") resets. Hovering a level opens a popover.
3. **PR detail → Timeline:** each finished run shows its own counters with the same
   popover. Clicking a level sets the filter and jumps to that run's accordion.

4. **Run trace drawer → Findings:** the same counters above the run's findings
   (sorted by severity); clicking a level filters that list locally.

Out of scope: persisting the filter in the URL, server-side filtering.

## Counting rule

Non-dismissed findings (`dismissed_at IS NULL`) of every review of the PR, grouped by
`severity` (`CRITICAL | WARNING | SUGGESTION`, the contract `Severity` enum). Levels with 0 are hidden.

## Contracts

Change `server/src/vendor/shared` and mirror it into `client/src/vendor/shared`.

| Schema | File | Field |
|---|---|---|
| `PrMeta` | `contracts/platform.ts` | `finding_counts: SeverityCounts.nullish()` (list endpoint only) |
| `SeverityCounts` (new) | `contracts/platform.ts` | `{ CRITICAL, WARNING, SUGGESTION }: int` |

No DB migration.

## Behaviour

### Server

`GET /repos/:id/pulls`: one grouped query
`findings ⋈ reviews WHERE pr_id IN (…) AND dismissed_at IS NULL GROUP BY pr_id, severity`.
A PR without findings gets `finding_counts: null`. Drizzle `count()` is converted with
`Number()`.

### Client

- `components/severity-counts`: `countBySeverity(findings)`, `<SeverityCounts>`
  (`compact` = icon + number, `full` = icon + number + label), `<FindingsPopover>`.
  Severity is never shown by colour alone (icon + label/aria-label).
- `FindingsPanel`: optional `severityFilter`; `visibleFindings(findings, hideLow, severity)`.
- `FindingsTab`: owns the filter state, renders the summary bar, passes the filter to
  every `ReviewRunAccordion` (runs with no matching findings are hidden) and per-run
  findings to `RunHistory`.
- `PRRow`: `finding_counts` counters; the popover fetches `GET /pulls/:id/reviews`
  (`usePrReviews`) only while hovered.

## Acceptance criteria

- [ ] PR list shows counters per severity; `—` for a PR without findings.
- [ ] Clicking a level on the PR page shows only that level; clicking again resets.
- [ ] Hovering counters shows a popover with the findings (title, category, file:line,
      confidence, rationale).
- [ ] Dismissed findings are not counted.
- [ ] Server and client `contracts/platform.ts` match.

## Open questions

None. Scope (list + detail) and global filter agreed on 2026-10-10.
