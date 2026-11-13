/* FindingsPopoverContent — read-only finding previews shown in the PR list's
   FINDINGS column popover. No Accept/Reject or any other action here; that
   lives only in the expanded Review-run accordion on the PR detail page. */
"use client";

import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingPreviewRow } from "@/components/FindingPreviewRow";

/** Sort weight per severity (lower = shown first) — mirrors FindingsPanel/constants.ts. */
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function FindingsPopoverContent({ prId, open }: { prId: string; open: boolean }) {
  const { data: reviews } = usePrReviews(open ? prId : null);
  const findings = (reviews ?? [])
    .flatMap((r) => r.findings)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  if (!reviews) {
    return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (findings.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No findings.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
      {findings.map((f) => (
        <FindingPreviewRow key={f.id} f={f} />
      ))}
    </div>
  );
}
