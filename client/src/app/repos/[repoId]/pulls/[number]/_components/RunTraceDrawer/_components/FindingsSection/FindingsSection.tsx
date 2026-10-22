/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. Severity
   counters on top double as a local filter (click a level; click again resets). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SeverityCounts, SEVERITIES, countBySeverity } from "@/components/severity-counts";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",
};

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  const tSev = useTranslations("prReview.severityCounts");
  const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const shown = React.useMemo(
    () =>
      findings
        .filter((f) => !sevFilter || f.severity === sevFilter)
        .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)),
    [findings, sevFilter],
  );
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <SeverityCounts
              variant="full"
              counts={counts}
              findings={findings}
              active={sevFilter}
              onSelect={(sev) => setSevFilter((cur) => (cur === sev ? null : sev))}
            />
            {sevFilter && (
              <Button kind="ghost" size="sm" icon="X" onClick={() => setSevFilter(null)}>
                {tSev("showAll")}
              </Button>
            )}
          </div>
          {shown.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                background: "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Badge color={SEV_COLOR[f.severity] ?? "var(--text-muted)"} bg="transparent">
                  {f.severity}
                </Badge>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</span>
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {f.rationale}
              </div>
              {f.suggestion && (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 6 }}>
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
