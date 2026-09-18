/* SeverityCountBadges — the clickable trigger: one icon+count per non-zero
   severity. Built from the canonical `SEV` tokens rather than a local colour
   map, and unfilled (no pill background) with an underlined count, which is
   what distinguishes the clickable list/timeline trigger from the filled
   `SeverityBadge` used on the Findings tab. */
"use client";

import React from "react";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import { SEVERITY_DISPLAY_ORDER } from "./constants";

export function totalFindings(counts: SeverityCounts): number {
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}

export function SeverityCountBadges({ counts }: { counts: SeverityCounts }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {SEVERITY_DISPLAY_ORDER.filter((key) => counts[key] > 0).map((key) => {
        const sev = SEV[key as Severity];
        const SevIcon = Icon[sev.icon];
        return (
          <span
            key={key}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: sev.c }}
          >
            <SevIcon size={13} />
            <span
              className="tnum"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: 3,
              }}
            >
              {counts[key]}
            </span>
          </span>
        );
      })}
    </span>
  );
}
