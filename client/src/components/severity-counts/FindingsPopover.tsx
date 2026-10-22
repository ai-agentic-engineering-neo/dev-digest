/* FindingsPopover — the hover card behind SeverityCounts: up to MAX_ITEMS
   findings (severity icon, title, category, file:lines, confidence, rationale)
   plus a "+N more" footer. Presentational only; SeverityCounts positions it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, ConfidenceNum, Skeleton, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

const MAX_ITEMS = 5;

const s = {
  card: {
    width: 440,
    maxWidth: "calc(100vw - 24px)",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    boxShadow: "var(--shadow-modal)",
    textAlign: "left",
    cursor: "default",
  } satisfies React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies React.CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "9px 0",
    borderTop: "1px solid var(--border)",
  } satisfies React.CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies React.CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies React.CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10 } satisfies React.CSSProperties,
  file: { fontSize: 12, color: "var(--accent-text)" } satisfies React.CSSProperties,
  rationale: {
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies React.CSSProperties,
  more: { fontSize: 12, color: "var(--text-muted)", paddingTop: 8, borderTop: "1px solid var(--border)" } satisfies React.CSSProperties,
} as const;

export function FindingsPopover({ findings, loading = false }: { findings: FindingRecord[]; loading?: boolean }) {
  const t = useTranslations("prReview.severityCounts");
  const shown = findings.slice(0, MAX_ITEMS);
  const rest = findings.length - shown.length;

  return (
    <div style={s.card}>
      <div style={s.header}>
        <Icon.Info size={12} />
        {loading ? t("loading") : t("popoverTitle", { count: findings.length })}
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={12} width="40%" />
          <Skeleton height={12} />
        </div>
      ) : (
        <>
          {shown.map((f) => {
            const sev = SEV[f.severity];
            const SevIcon = Icon[sev.icon];
            const lines = f.end_line > f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
            return (
              <div key={f.id} style={s.item}>
                <div style={s.titleRow}>
                  <SevIcon size={14} style={{ color: sev.c, flexShrink: 0 }} aria-label={t(f.severity)} />
                  <span style={s.title} title={f.title}>
                    {f.title}
                  </span>
                  <CategoryTag category={f.category as Category} />
                </div>
                <div style={s.metaRow}>
                  <span className="mono" style={s.file}>
                    {f.file}:{lines}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
                <div style={s.rationale}>{f.rationale}</div>
              </div>
            );
          })}
          {rest > 0 && <div style={s.more}>{t("more", { count: rest })}</div>}
        </>
      )}
    </div>
  );
}
