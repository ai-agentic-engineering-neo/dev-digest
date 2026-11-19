"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "../../[number]/_components/FindingsPanel/helpers";
import { SEVERITY_LEVELS } from "../../[number]/_components/FindingsPanel/constants";

/** The subset of a finding the hover needs (PR list previews and full records both fit). */
export type FindingPreview = Pick<
  FindingRecord,
  "id" | "severity" | "category" | "title" | "file" | "start_line" | "end_line" | "confidence" | "rationale"
>;

const MAX_SHOWN = 5;

/** Severity icons + counts; hovering/focusing shows a popover with the
 *  findings (severity, title, category, file:lines, confidence). */
const POPOVER_W = 420;
const POPOVER_EST_H = 380;

export function FindingsHover({ findings }: { findings: FindingPreview[] }) {
  const t = useTranslations("prReview");
  const [pos, setPos] = React.useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const open = pos !== null;
  // Portal + fixed position so the popover is never clipped by a scrolling /
  // overflow:hidden ancestor (e.g. the PR list table card). Flips up near the bottom.
  const show = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return setPos({ left: 0, top: 0 });
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_W - 8));
    const below = window.innerHeight - r.bottom;
    setPos(below >= POPOVER_EST_H || r.top < POPOVER_EST_H
      ? { left, top: r.bottom + 6 }
      : { left, bottom: window.innerHeight - r.top + 6 });
  };
  const hide = () => setPos(null);
  const counts = countBySeverity(findings);
  const sorted = visibleFindings(findings, false);
  const shown = sorted.slice(0, MAX_SHOWN);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span tabIndex={0} style={{ display: "inline-flex", gap: 10, verticalAlign: "middle", outline: "none" }}>
        {SEVERITY_LEVELS.filter((l) => counts[l] > 0).map((l: Severity) => {
          const I = Icon[SEV[l].icon];
          return (
            <span
              key={l}
              aria-label={`${counts[l]} ${t(`panel.severity.${l}`)}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, color: SEV[l].c, fontWeight: 600 }}
            >
              <I size={12} />
              <span className="tnum">{counts[l]}</span>
            </span>
          );
        })}
      </span>
      {open && pos && createPortal(
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            zIndex: 1000,
            width: POPOVER_W,
            maxWidth: "80vw",
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            color: "var(--text-primary)",
            textAlign: "left",
            cursor: "default",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            <Icon.Info size={12} />
            {t("timeline.findingsInRun", { count: findings.length })}
          </div>
          {shown.map((f, i) => {
            const meta = SEV[f.severity as Severity] ?? SEV.INFO;
            const I = Icon[meta.icon];
            return (
              <div
                key={f.id}
                style={{
                  padding: "8px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "3px 6px",
                      borderRadius: 5,
                      background: meta.bg,
                      color: meta.c,
                      flexShrink: 0,
                    }}
                  >
                    <I size={13} />
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {f.title}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    <CategoryTag category={f.category as never} />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span className="mono" style={{ color: "var(--accent)" }}>
                    {f.file}:{f.start_line}
                    {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {f.rationale}
                </div>
              </div>
            );
          })}
          {sorted.length > MAX_SHOWN && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", paddingTop: 6 }}>
              {t("timeline.moreFindings", { count: sorted.length - MAX_SHOWN })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
