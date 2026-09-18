/* SeverityFindingsPopover — read-only preview panel for FindingsBySeverityBadge.
   Portaled to document.body so it never gets clipped by an ancestor's
   overflow:hidden (e.g. the PR list's table card). Purely presentational —
   all open/pin/filter state lives in the parent. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { SeverityBadge, CategoryTag, type Category } from "@devdigest/ui";
import type { Severity, FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER } from "./constants";
import { s } from "./styles";

export function SeverityFindingsPopover({
  position,
  findings,
  filter,
  panelRef,
  onMouseEnter,
  onMouseLeave,
}: {
  position: { top: number; left: number };
  /** undefined = still loading (placement A only, before the lazy fetch resolves). */
  findings: FindingRecord[] | undefined;
  filter: Severity | null;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const total = findings?.length ?? 0;
  const list = React.useMemo(() => {
    if (!findings) return [];
    const filtered = filter ? findings.filter((f) => f.severity === filter) : findings;
    return [...filtered].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity as Severity) - SEVERITY_ORDER.indexOf(b.severity as Severity),
    );
  }, [findings, filter]);

  return createPortal(
    <div
      ref={panelRef}
      style={{ ...s.panel, top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="group"
      aria-label="Active findings"
    >
      <div style={s.panelTitle}>{total} FINDINGS IN THIS RUN</div>
      {findings === undefined ? (
        <div style={s.loading}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={s.loading}>No findings.</div>
      ) : (
        list.map((f, i) => (
          <div key={f.id} style={i === 0 ? s.itemFirst : s.item}>
            <div style={s.itemHeader}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <span style={s.itemTitle}>{f.title}</span>
            </div>
            <div style={s.itemMetaRow}>
              <CategoryTag category={f.category as Category} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {f.file}:{f.start_line}
              </span>
              <span className="mono tnum" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {Math.round(f.confidence * 100)}% conf
              </span>
            </div>
            <div style={s.itemDesc}>{f.rationale}</div>
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
