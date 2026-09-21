"use client";

import React from "react";
import { SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { Severity, FindingCategory } from "@devdigest/shared";

export interface FindingPreviewItem {
  severity: Severity;
  title: string;
  category: FindingCategory;
  file: string;
  line: number;
  confidence: number;
  description: string;
}

const panelStyle: React.CSSProperties = {
  width: 380,
  maxHeight: 320,
  overflowY: "auto",
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  boxShadow: "var(--shadow-modal)",
  textAlign: "left",
};

export function FindingPreviewPanel({
  heading,
  items,
}: {
  heading: string;
  items: FindingPreviewItem[];
}) {
  return (
    <div role="dialog" aria-label={heading} style={panelStyle}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: 10,
        }}
      >
        {heading}
      </div>
      {items.map((it, i) => (
        <div
          key={`${it.file}:${it.line}:${i}`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingBottom: 10,
            marginBottom: 10,
            borderBottomWidth: i === items.length - 1 ? 0 : 1,
            borderBottomStyle: "solid",
            borderBottomColor: "var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SeverityBadge severity={it.severity} compact />
            <span style={{ fontWeight: 600, fontSize: 13 }}>{it.title}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            <CategoryTag category={it.category} />
            <span className="mono">
              {it.file}:{it.line}
            </span>
            <span>{Math.round(it.confidence * 100)}% conf</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{it.description}</div>
        </div>
      ))}
    </div>
  );
}
