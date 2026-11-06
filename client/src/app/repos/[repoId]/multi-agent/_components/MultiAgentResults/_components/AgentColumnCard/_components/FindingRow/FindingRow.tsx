"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { SeverityBadge } from "@devdigest/ui";

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 0",
  borderTop: "1px solid var(--border)",
};
const titleStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-primary)", lineHeight: 1.35 };
const locStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--text-muted)", wordBreak: "break-all" };

export function FindingRow({ finding }: { finding: FindingRecord }) {
  return (
    <li style={rowStyle}>
      <SeverityBadge severity={finding.severity} compact />
      <span style={titleStyle}>{finding.title}</span>
      <span className="mono" style={locStyle}>
        {finding.file}:{finding.start_line}
      </span>
    </li>
  );
}

export default FindingRow;
