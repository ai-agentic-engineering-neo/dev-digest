/* FindingPreviewRow — one read-only line in the findings popover: severity
   icon, title, category, file:line, confidence, short description. No
   accept/dismiss affordance and no links — hover previews never mutate state. */
"use client";

import React from "react";
import { SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { Severity, Category } from "@devdigest/ui";
import { lineLabel, type FindingPreviewLike } from "./helpers";

export function FindingPreviewRow({ finding }: { finding: FindingPreviewLike }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 7,
        padding: "8px 10px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <SeverityBadge severity={finding.severity as Severity} compact />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {finding.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        <CategoryTag category={finding.category as Category} />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {finding.file}:{lineLabel(finding)}
        </span>
        <ConfidenceNum value={finding.confidence} />
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {finding.rationale}
      </div>
    </div>
  );
}
