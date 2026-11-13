/* FindingPreview — read-only summary of one finding for the findings popover:
   severity icon, title, category, file:line, confidence, 2-line rationale.
   Deliberately has NO actions (accept/dismiss live on the PR detail page). */
"use client";

import React from "react";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** Markdown rationale → one plain-text line (the preview is clamped anyway). */
function plainText(md: string): string {
  return md
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*(#+|>)\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function FindingPreview({ f, first }: { f: FindingRecord; first: boolean }) {
  return (
    <div data-finding-preview={f.id} style={s.preview(first)}>
      <div style={s.previewTitleRow}>
        <span style={s.previewBadge}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </span>
        <span style={s.previewTitle}>
          <span>{f.title}</span>
          <span style={s.previewCategory}>
            <CategoryTag category={f.category as Category} />
          </span>
        </span>
      </div>
      <div style={s.previewMeta}>
        <span className="mono" style={s.previewFile}>
          {f.file}:{lineLabel(f)}
        </span>
        <span style={s.previewNoWrap}>
          <ConfidenceNum value={f.confidence} />
        </span>
      </div>
      <div style={s.previewRationale}>{plainText(f.rationale)}</div>
    </div>
  );
}
