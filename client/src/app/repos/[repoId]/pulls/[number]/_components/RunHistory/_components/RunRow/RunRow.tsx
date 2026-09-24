/* RunRow — one agent run in the timeline: outcome badge, score, agent/model,
   error or finding counts (with hover popover), time + usage, trace / delete. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import { CostText } from "@/components/cost-text";
import { FindingsHover, countBySeverity } from "@/components/findings-hover";
import { OUTCOME_STYLE } from "../../constants";
import { outcomeKey, usageTokens } from "../../helpers";
import { s } from "../../styles";

interface RunRowProps {
  run: RunSummary;
  /** The run's persisted findings, when its review is loaded. */
  findings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

export function RunRow({ run: r, findings, onOpenTrace, onGoToReview, onDelete }: RunRowProps) {
  const t = useTranslations("prReview");
  const key = outcomeKey(r);
  const o = OUTCOME_STYLE[key];
  const settled = r.status === "done";
  const tokens = usageTokens(r);
  const blockers = r.blockers ?? 0;
  const blockersText = blockers > 0 ? t("runStatus.blockers", { count: blockers }) : "";
  const agentName = r.agent_name ?? t("timeline.agentFallback");

  return (
    <div style={s.runRow}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={s.runMain}>
        <div style={s.runTitle}>
          {onGoToReview ? (
            <button
              type="button"
              onClick={() => onGoToReview(r.run_id)}
              title={t("timeline.goToReview")}
              style={s.agentLink}
            >
              {agentName}
            </button>
          ) : (
            <span>{agentName}</span>
          )}{" "}
          <span className="mono" style={s.model}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={s.error} title={r.error}>
            {r.error}
          </div>
        )}
        {settled &&
          (findings && findings.length > 0 ? (
            <div style={s.counts}>
              <FindingsHover counts={countBySeverity(findings)} items={findings} />
              {blockersText}
            </div>
          ) : (
            <div style={s.countsPlain}>
              {t("runStatus.findings", { count: r.findings_count ?? 0 })}
              {blockersText}
            </div>
          ))}
      </div>
      <div style={s.side}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {tokens != null && (
          <span
            className="mono tnum"
            style={s.usage}
            title={t("timeline.tokensSplit", { tokensIn: r.tokens_in ?? 0, tokensOut: r.tokens_out ?? 0 })}
          >
            {t("timeline.tokens", { count: tokens })}
            {r.cost_usd != null && (
              <>
                {" · "}
                <CostText usd={r.cost_usd} />
              </>
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}
