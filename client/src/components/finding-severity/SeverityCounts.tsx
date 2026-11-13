/* SeverityCounts — compact "icon + number" per severity (non-zero only), as on
   the PR list FINDINGS column and the timeline run tiles. Display-only. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { SeverityCounts as Counts } from "@devdigest/shared";
import { SEVERITY_KEYS, totalFindings } from "./helpers";
import { s } from "./styles";

export function SeverityCounts({ counts }: { counts: Counts | null | undefined }) {
  if (!counts || totalFindings(counts) === 0) return <span style={s.dash}>—</span>;
  return (
    <span style={s.counts}>
      {SEVERITY_KEYS.filter((k) => counts[k] > 0).map((k) => {
        const I = Icon[SEV[k].icon];
        return (
          <span key={k} style={s.count(SEV[k].c)} aria-label={`${counts[k]} ${SEV[k].label}`}>
            <I size={13} />
            <span className="tnum">{counts[k]}</span>
          </span>
        );
      })}
    </span>
  );
}
