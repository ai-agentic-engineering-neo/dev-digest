"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "../FindingsPanel/helpers";
import { SEVERITY_LEVELS } from "../FindingsPanel/constants";

const MAX_SHOWN = 5;

/** Severity icons + counts for one run; hovering/focusing shows a popover with
 *  that run's findings (severity, title, category, file:lines, confidence). */
export function RunFindingsHover({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const counts = countBySeverity(findings);
  const sorted = visibleFindings(findings, false);
  const shown = sorted.slice(0, MAX_SHOWN);

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
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
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            zIndex: 30,
            width: 420,
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
        </div>
      )}
    </span>
  );
}
