/* FindingPreviewRow — one read-only finding summary: severity, title,
   category, file:line, confidence%, and a truncated rationale. No actions —
   shared by the PR-list FINDINGS popover and the PR-detail Timeline's
   per-run findings modal, both of which only ever preview, never act. */
"use client";

import { SeverityBadge, CategoryTag, MonoLink, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";

export interface FindingPreview {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale: string;
}

function lineLabel(startLine: number, endLine: number): string {
  return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
}

export function FindingPreviewRow({ f }: { f: FindingPreview }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SeverityBadge severity={f.severity as Severity} compact />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CategoryTag category={f.category as Category} />
        <MonoLink>
          {f.file}:{lineLabel(f.start_line, f.end_line)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--text-secondary)",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {f.rationale}
      </p>
    </div>
  );
}
