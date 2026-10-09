/* ColumnsLayout — Screen C. One column per grouped agent: name + derived
   identity, provider, model, status, verdict, score, summary, duration, cost,
   compact finding rows (severity, title, file path), a per-column finding
   count, and a view-logs affordance (AC-25, AC-32). */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Card, Badge, SeverityBadge, CircularScore, Button, Icon, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";
import { agentIdentity } from "@/lib/agent-identity";
import { columnStatusIcon, formatSeconds } from "./helpers";
import { formatCost } from "@/lib/format";

const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  identityDot: (color: string): CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    background: color + "22",
    color,
    flexShrink: 0,
  }),
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  noScore: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    gap: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  errorBox: {
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12,
  } satisfies CSSProperties,
  findingsCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
  } satisfies CSSProperties,
  findingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  findingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  } satisfies CSSProperties,
  findingTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingFile: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
};

export function ColumnsLayout({
  columns,
  onlyConflicts,
  conflictFiles,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  /** AC-41 — when true, each column's finding list is restricted to files
   *  that have at least one conflict. */
  onlyConflicts: boolean;
  conflictFiles: Set<string>;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");

  return (
    <div style={s.grid}>
      {columns.map((c) => {
        const identity = agentIdentity(c.agent_id);
        const StatusIcon = Icon[columnStatusIcon(c.status)];
        const findings = onlyConflicts ? c.findings.filter((f) => conflictFiles.has(f.file)) : c.findings;
        return (
          <Card key={c.run_id} style={s.column}>
            <div style={s.header}>
              <span style={s.identityDot(identity.color)}>
                <Icon.Cpu size={13} style={{ color: identity.color }} />
              </span>
              <span style={s.agentName}>{c.agent_name}</span>
              {c.status !== "done" && (
                <Badge
                  icon={columnStatusIcon(c.status)}
                  color={c.status === "failed" ? "var(--crit)" : "var(--text-muted)"}
                  bg={c.status === "failed" ? "var(--crit-bg)" : "var(--bg-hover)"}
                >
                  {t(`column.${c.status}`)}
                </Badge>
              )}
            </div>

            <div style={s.metaRow}>
              {c.provider && <span>{c.provider}</span>}
              {c.model && <span className="mono">{c.model}</span>}
            </div>

            <div style={s.scoreRow}>
              {c.score != null ? <CircularScore score={c.score} size={40} /> : <span style={s.noScore}>—</span>}
              {c.verdict && <Badge>{c.verdict}</Badge>}
            </div>

            <div style={s.summary}>{c.summary ?? t("tabs.noSummary")}</div>

            <div style={s.statsRow}>
              <span>{c.duration_ms != null ? formatSeconds(c.duration_ms) : "—"}</span>
              <span>{formatCost(c.cost_usd)}</span>
            </div>

            {c.status === "failed" && c.error && (
              <div style={s.errorBox}>
                <StatusIcon size={13} style={{ marginRight: 6 }} />
                {c.error}
              </div>
            )}

            <div style={s.findingsCount}>
              {findings.length === 0 ? t("column.noFindings") : t("column.findingsCount", { count: findings.length })}
            </div>

            <div style={s.findingsList}>
              {findings.map((f) => (
                <div key={f.id} style={s.findingRow}>
                  <SeverityBadge severity={f.severity as Severity} compact />
                  <span style={s.findingTitle}>{f.title}</span>
                  <span className="mono" style={s.findingFile}>
                    {f.file}
                  </span>
                </div>
              ))}
            </div>

            <Button kind="ghost" size="sm" icon="FileText" onClick={() => onOpenTrace(c.run_id)}>
              {t("viewTrace")}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
