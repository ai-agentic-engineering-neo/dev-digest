# Severity counters on the Agent runs tab

Expanded review run (`ReviewRunAccordion` → `FindingsPanel`) shows a row of
counter pills above its findings list: `1 CRITICAL · 3 WARNING · 1 SUGGESTION`.

## Acceptance
- One pill per severity with ≥1 finding in this run; zero levels are hidden.
- Counts = number of findings of that severity in the run (computed client-side
  from `usePrReviews` data — no new request, no model call).
- Click a pill → list shows only that severity; click it again → full list.
- Combines with "Hide low confidence" (both conditions apply).
- Colors/labels come from `SEV` (`@devdigest/ui`); no custom palette.
- Not to be confused with the header's "N blockers" (non-dismissed CRITICAL).

Code: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`
(`countBySeverity`, `visibleFindings` in helpers.ts; test in FindingsPanel.test.tsx).
