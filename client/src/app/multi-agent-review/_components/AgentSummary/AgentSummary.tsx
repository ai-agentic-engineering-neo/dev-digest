/* AgentSummary — the ONE per-agent header/summary card shared by the Columns
   and Tabs views (AC-16): live status, score, duration, cost, and a
   "View trace" action. Status is resolved by the caller (live SSE/poll vs
   the persisted column) and passed in — this component is presentation-only. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, CircularScore } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { RunCostBadge } from "@/components";
import { formatSeconds } from "../format";
import { STATUS_META, type LiveAgentStatus } from "./constants";
import { s } from "./styles";

export function AgentSummary({
  column,
  status,
  onViewTrace,
}: {
  column: AgentColumn;
  status: LiveAgentStatus;
  onViewTrace?: () => void;
}) {
  const t = useTranslations("multiAgentReview");
  const meta = STATUS_META[status];
  const StatusIcon = Icon[meta.icon];

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <span style={s.name} title={column.agent_name}>
          {column.agent_name}
        </span>
        <span style={s.statusBadge(meta.color, meta.bg)}>
          <StatusIcon size={11} style={status === "running" ? s.spin : undefined} />
          {t(`agentSummary.status.${status}`)}
        </span>
      </div>

      <div style={s.metrics}>
        <div style={s.metric}>
          <span style={s.metricLabel}>{t("agentSummary.score")}</span>
          {column.score != null ? (
            <CircularScore score={column.score} size={28} stroke={2.5} />
          ) : (
            <span style={s.muted}>{t("agentSummary.noValue")}</span>
          )}
        </div>
        <div style={s.metric}>
          <span style={s.metricLabel}>{t("agentSummary.duration")}</span>
          <span className="tnum" style={s.metricValue}>
            {column.duration_ms != null ? formatSeconds(column.duration_ms) : t("agentSummary.noValue")}
          </span>
        </div>
        <div style={s.metric}>
          <span style={s.metricLabel}>{t("agentSummary.cost")}</span>
          <RunCostBadge cost={column.cost_usd} />
        </div>
      </div>

      {status === "failed" && (
        <div style={s.errorBox} role="alert">
          <Icon.AlertOctagon size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{column.summary || t("agentSummary.unknownError")}</span>
        </div>
      )}

      {onViewTrace && (
        <button type="button" style={s.traceLink} onClick={onViewTrace}>
          <Icon.ExternalLink size={13} />
          {t("agentSummary.viewTrace")}
        </button>
      )}
    </div>
  );
}
