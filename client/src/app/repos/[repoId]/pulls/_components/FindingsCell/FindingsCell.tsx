/* FindingsCell — the PR list's FINDINGS column. Shows compact per-severity
   badges from the list's cheap findings_by_severity aggregate; hovering
   lazily fetches the PR's reviews (existing hook) and previews the latest
   review's actual findings in a portal-rendered popover (the table card
   clips overflow, so a normal absolutely-positioned child would be cut
   off). Clicking the cell or a finding opens the PR on the Findings tab. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon, SeverityBadge, CategoryTag, MonoLink, ConfidenceNum } from "@devdigest/ui";
import { usePrReviews } from "@/lib/hooks/reviews";
import { githubBlobUrl } from "@/lib/github-urls";
import type { PrMeta } from "@/lib/types";
import { SEVERITY_ORDER, lineLabel, pickLatestReview, sortBySeverity } from "./helpers";
import { s } from "./styles";

/** Delay before the popover opens, so a quick mouse-through doesn't flicker it. */
const SHOW_DELAY_MS = 150;
/** Grace period before closing, so moving from the badges into the popover works. */
const HIDE_DELAY_MS = 100;

export function FindingsCell({
  pr,
  repoId,
  repoFullName,
}: {
  pr: PrMeta;
  repoId: string;
  repoFullName: string | null;
}) {
  const router = useRouter();
  const cellRef = React.useRef<HTMLDivElement | null>(null);
  const showTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const counts = pr.findings_by_severity;
  const nonZero = SEVERITY_ORDER.filter((sev) => (counts?.[sev] ?? 0) > 0);

  const { data: reviews } = usePrReviews(pr.id, { enabled: open });
  const latestReview = pickLatestReview(reviews);
  const findings = latestReview ? sortBySeverity(latestReview.findings) : [];

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  };
  const scheduleShow = () => {
    cancelHide();
    if (cellRef.current) setRect(cellRef.current.getBoundingClientRect());
    showTimer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  };
  const cancelShow = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  React.useEffect(
    () => () => {
      cancelShow();
      cancelHide();
    },
    [],
  );

  const goToFindings = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/repos/${repoId}/pulls/${pr.number}?tab=findings`);
  };

  if (nonZero.length === 0) return <div />;

  return (
    <div
      ref={cellRef}
      style={s.cell}
      onMouseEnter={scheduleShow}
      onMouseLeave={() => {
        cancelShow();
        scheduleHide();
      }}
      onClick={goToFindings}
    >
      {nonZero.map((sev) => (
        <SeverityBadge key={sev} severity={sev} count={counts![sev]} compact />
      ))}

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              style={s.popover(rect)}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
              onClick={goToFindings}
            >
              <div style={s.popoverHeader}>
                <Icon.AlertOctagon size={13} />
                {findings.length} FINDINGS
              </div>
              {!reviews ? (
                <div style={s.popoverLoading}>Loading…</div>
              ) : findings.length === 0 ? (
                <div style={s.popoverLoading}>No findings.</div>
              ) : (
                findings.map((f) => (
                  <div key={f.id} style={s.findingRow}>
                    <SeverityBadge severity={f.severity} compact />
                    <div style={s.findingMain}>
                      <div style={s.findingTitleRow}>
                        <span style={s.findingTitle}>{f.title}</span>
                        <CategoryTag category={f.category} />
                      </div>
                      <div style={s.findingMetaRow}>
                        <MonoLink
                          href={
                            repoFullName
                              ? githubBlobUrl(repoFullName, pr.head_sha, f.file, f.start_line, f.end_line)
                              : undefined
                          }
                        >
                          {f.file}:{lineLabel(f)}
                        </MonoLink>
                        <ConfidenceNum value={f.confidence} />
                      </div>
                      <div style={s.findingRationale}>{f.rationale}</div>
                    </div>
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
