/* SeverityFilterPills — "N CRITICAL · N WARNING · N SUGGESTION" row above the
   findings list. Clicking a pill narrows the list below to that severity;
   clicking the same pill again clears the filter. Counts are a plain
   COUNT/filter over findings already loaded by this run — no LLM call. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITIES } from "./constants";
import type { SeverityCountMap } from "./helpers";

export function SeverityFilterPills({
  counts,
  active,
  onToggle,
}: {
  counts: SeverityCountMap;
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const shown = SEVERITIES.filter((sev) => counts[sev] > 0);
  if (shown.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {shown.map((sev, i) => {
        const meta = SEV[sev];
        const SevIcon = Icon[meta.icon];
        const isActive = active === sev;
        return (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span aria-hidden style={{ color: "var(--text-muted)", fontSize: 12 }}>
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={isActive}
              aria-label={`${counts[sev]} ${meta.label} — filter to ${meta.label.toLowerCase()} only`}
              onClick={() => onToggle(sev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 9px",
                borderRadius: 5,
                border: `1px solid ${isActive ? meta.c : "transparent"}`,
                background: isActive ? meta.bg : "transparent",
                color: meta.c,
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                cursor: "pointer",
                opacity: active && !isActive ? 0.55 : 1,
              }}
            >
              <SevIcon size={12.5} />
              <span className="tnum">{counts[sev]}</span> {meta.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
