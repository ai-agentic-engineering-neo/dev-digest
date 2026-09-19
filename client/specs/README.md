# Severity Findings Surface — Feature Spec

## Summary

Surface finding severity across two UI surfaces to help users prioritize review findings by confidence and impact. The **Findings column on the PR list** displays severity chips (CRITICAL, WARNING, SUGGESTION) with counts from the latest agent run; hovering shows a read-only popover listing findings. In the **PR detail Findings tab**, the Review Runs accordion expands to show a verdict banner and a Findings panel with severity filter pills, hide-low-confidence toggle, keyboard navigation (j/k), and inline actions (a/d to accept/dismiss findings).

## Acceptance Criteria

### PR List Findings Column
- [ ] FINDINGS column displays severity chips (CRITICAL, WARNING, SUGGESTION) with counts from `pr.findings_counts` (server-computed; zero-count severities omitted) — **`PRRow.tsx` line 82–86**
- [ ] Severity chips render in order CRITICAL → WARNING → SUGGESTION via `FINDINGS_SEVERITIES` constant — **`constants.ts` line 54**
- [ ] Hovering the FINDINGS cell triggers lazy fetch of `usePrReviews(prId, preview != null)` on first hover only — **`PRRow.tsx` line 31**
- [ ] Hover popover (FindingsPreviewCard) displays "N FINDINGS IN THIS RUN" title, then severity badge + title + category + file:line + confidence + rationale per finding, no buttons — **`FindingsPreviewCard.tsx` line 10–44**
- [ ] Popover uses `latestFindingsPerAgent()` to show only the latest review per agent, avoiding duplicates across re-runs — **`helpers.ts` line 45–56**
- [ ] Popover is read-only; clicking it does not navigate or select findings

### Findings Panel in PR Detail (Review Runs Accordion)
- [ ] ReviewRunAccordion header shows findings count + blockers (CRITICAL unflagged findings) — **`ReviewRunAccordion.tsx` line 60–61, 101–102**
- [ ] Clicking the accordion header expands the body, revealing VerdictBanner + FindingsPanel — **`ReviewRunAccordion.tsx` line 140–162**
- [ ] FindingsPanel displays severity filter pills (CRITICAL, WARNING, SUGGESTION) grouped and ordered CRITICAL → WARNING → SUGGESTION via `SEVERITY_FILTERS` — **`FindingsPanel.tsx` line 69–77** and **`constants.ts` line 21–25**
- [ ] Each pill displays the count of findings at that severity after applying the hideLow filter (but NOT the severity filter) — **`FindingsPanel.tsx` line 35–36**
- [ ] Clicking a pill filters the finding list to that severity; clicking the same pill again clears the filter (toggles) — **`FindingsPanel.tsx` line 74–75**
- [ ] Pill counts always equal the number of finding cards shown when that pill is clicked — **`FindingsPanel.tsx` line 37–39**
- [ ] Hide-low-confidence toggle (0.65 threshold) removes findings below 65% confidence when enabled — **`constants.ts` line 12** and **`FindingsPanel.tsx` line 29**
- [ ] Finding cards are sorted by severity (CRITICAL first) via `SEVERITY_ORDER` — **`helpers.ts` line 18–20** and **`constants.ts` line 4–9**
- [ ] j/k keyboard navigation moves focus up/down in the filtered list; a/d on a focused finding accepts/dismisses it — **`FindingsPanel.tsx` line 48–60** and **`constants.ts` line 15–18**
- [ ] Focus index resets to 0 when hideLow or severity filter changes — **`FindingsPanel.tsx` line 43–45**
- [ ] No findings match: render empty state "No findings match. Adjust the filters above, or run a review to generate findings." — **`FindingsPanel.tsx` line 87–88**

### Data & Caching
- [ ] PR list uses `["pulls", repoId]` query key; findings counts come from server (no client-side aggregation) — **`page.tsx` line 35**
- [ ] PR detail uses `["reviews", prId]` query key for the full review list (one per agent run) — **`ReviewRunAccordion.tsx` line 157**
- [ ] Hover preview only fetches on first hover (lazy), then reuses `["reviews", prId]` cache — **`PRRow.tsx` line 31**
- [ ] Accepting/dismissing a finding invalidates `["reviews", prId]` so UI updates immediately — **`src/lib/hooks/reviews.ts` line 143–165**

### Internationalization
- [ ] `prReview.panel.hideLowConfidence` — toggle label — **`prReview.json` line 30**
- [ ] `prReview.panel.noMatchTitle` — empty state title — **`prReview.json` line 31**
- [ ] `prReview.panel.noMatchBody` — empty state body — **`prReview.json` line 32**
- [ ] `prReview.list.findingsPreviewTitle` — popover header formatted as "{count} FINDINGS IN THIS RUN" — **`helpers.ts` — used at `PRRow.tsx` line 90**

## Non-Goals

- **No new LLM calls:** severity is assigned by the existing review agent; this feature only surfaces it
- **No severity filtering across PRs:** filters are per-run in the PR detail view; the PR list only shows counts from the latest run per PR
- **No bulk severity actions:** accept/dismiss is per-finding; no "accept all CRITICAL" shortcut
- **No custom severity thresholds:** hide-low threshold (0.65) is hardcoded; no user configuration
- **No server-side schema changes:** findings already carry `severity` and `confidence`; this feature only aggregates and filters client-side

## Data Flow Diagram (Prose)

```
Server (Fastify API)
  │
  ├─ GET /repos/:repoId/pulls
  │  └─ returns PrMeta[] with findings_counts: { CRITICAL, WARNING, SUGGESTION }
  │
  └─ GET /pulls/:prId/reviews
     └─ returns ReviewRecord[] (newest first) with findings: FindingRecord[]
        (each FindingRecord has severity, confidence, title, category, file, start_line, rationale)

Client (React)
  │
  ├─ PR List Page (/repos/:repoId/pulls)
  │  │
  │  ├─ usePulls(repoId) → ["pulls", repoId] → fetch /repos/:repoId/pulls
  │  │
  │  └─ PRRow (for each PR)
  │     │
  │     ├─ presentFindingsSeverities(pr) → [Severity, count][]
  │     │  └─ renders SeverityBadge pills (CRITICAL, WARNING, SUGGESTION)
  │     │
  │     └─ On hover findings cell:
  │        │
  │        ├─ usePrReviews(prId, preview != null && hasFindings) → ["reviews", prId]
  │        │  └─ lazy fetch /pulls/:prId/reviews
  │        │
  │        └─ latestFindingsPerAgent(reviews) → FindingRecord[]
  │           └─ FindingsPreviewCard (read-only popover, fixed position)
  │
  └─ PR Detail Page (/repos/:repoId/pulls/:number)
     │
     ├─ usePrReviews(prId) → ["reviews", prId] (already cached if hovered PR list)
     │
     └─ FindingsTab
        │
        └─ ReviewRunAccordion (for each review)
           │
           ├─ Header: agent name, verdict badge, findings + blockers count, score, timestamp, delete button
           │
           └─ Body (when open):
              │
              ├─ VerdictBanner: verdict, summary, score, cost breakdown
              │
              └─ FindingsPanel:
                 │
                 ├─ useFindingAction() → POST /findings/:findingId/:action → invalidate ["reviews", prId]
                 │
                 ├─ Severity filter pills (CRITICAL, WARNING, SUGGESTION)
                 │  └─ onClick: toggle severity filter (or clear if already selected)
                 │
                 ├─ Hide-low-confidence toggle (threshold 0.65)
                 │
                 ├─ j/k keyboard navigation (up/down in filtered list)
                 │
                 ├─ a/d keyboard shortcuts (accept/dismiss focused finding)
                 │
                 └─ FindingCard list (sorted by severity, filtered by severity + hideLow)
                    └─ Each card: inline accept/dismiss buttons
```

## Implementation Files

| Component | Purpose | Citation |
|-----------|---------|----------|
| **PRRow** | PR list row with findings severity chips and hover preview | `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` line 16–107 |
| **FindingsPreviewCard** | Read-only hover popover showing finding details | `src/components/findings-preview/FindingsPreviewCard.tsx` line 10–44 |
| **ReviewRunAccordion** | Collapsible agent run header + body | `src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` line 26–167 |
| **FindingsPanel** | Severity filter pills, hide-low toggle, finding list, j/k/a/d navigation | `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` line 16–106 |
| **FindingsPanel helpers** | `visibleFindings()`, `severityCounts()` | `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts` line 10–34 |
| **FindingsPanel constants** | `SEVERITY_ORDER`, `SEVERITY_FILTERS`, `LOW_CONFIDENCE_THRESHOLD`, `KEY_TO_ACTION` | `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts` line 4–25 |
| **PRRow helpers** | `presentFindingsSeverities()`, `latestFindingsPerAgent()` | `src/app/repos/[repoId]/pulls/helpers.ts` line 30–56 |
| **PR list constants** | `FINDINGS_SEVERITIES` | `src/app/repos/[repoId]/pulls/constants.ts` line 54 |
| **Hooks** | `usePrReviews()`, `useFindingAction()` | `src/lib/hooks/reviews.ts` line 55–61, 143–165 |
